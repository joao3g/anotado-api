// Reads an expense typed in a WhatsApp message, e.g. "uber 23,50 crédito nubank ontem".
// Pure functions (no database): the caller passes today's Brazil date and the group's cards and categories.
// Amounts are handled as text (digits), never with float math, and ambiguous values are reported, not guessed.
import { PaymentMethod } from '../generated/prisma/enums.js';

export type ParserCard = { id: string, title: string, lastFourDigits: string | null };
export type ParserCategory = { id: string, title: string };

export type AmountProblem = "MISSING" | "AMBIGUOUS" | "MULTIPLE" | "INVALID";

export type ParsedExpense = {
    title: string,
    amount: string | null, // "1234.56" (always 2 decimals) or null with amountProblem
    amountProblem: AmountProblem | null,
    date: string, // "YYYY-MM-DD"
    dateProblem: boolean, // true when a date was typed but does not exist (e.g. 31/02)
    paymentMethod: PaymentMethod | null,
    cardId: string | null,
    categoryId: string | null
};

// Lower case, no accents: "Crédito" -> "credito".
export function normalize(text: string) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const PAYMENT_WORDS: Record<string, PaymentMethod> = {
    credito: "CREDIT", cartao: "CREDIT", cc: "CREDIT",
    debito: "DEBIT", pix: "DEBIT", dinheiro: "DEBIT", especie: "DEBIT", boleto: "DEBIT",
    vale: "VOUCHER", vr: "VOUCHER", va: "VOUCHER", voucher: "VOUCHER"
};

// Small words that only connect a removed token to the title: "mercado NO crédito" -> "Mercado".
const CONNECTORS = new Set(["no", "na", "com", "em", "pelo", "pela", "de", "do", "da", "via", "final", "r$"]);

const DATE_WORDS: Record<string, number> = { hoje: 0, ontem: -1, anteontem: -2 };

const MAX_INTEGER_DIGITS = 8; // Decimal(10,2): up to 99.999.999,99

type Token = { raw: string, norm: string, used: boolean, amount?: AmountCandidate };
type AmountCandidate = { value: string | null, problem: "AMBIGUOUS" | "INVALID" | null, strong: boolean };

// "45" | "45,9" | "45,90" | "45.90" | "1.234,56" -> "45.00" ... Returns null when the token is not a number.
function readAmount(token: string, afterCurrency: boolean): AmountCandidate | null {
    let text = token;
    let strong = afterCurrency;
    if (/^r\$/i.test(text)) { text = text.slice(2); strong = true; }
    if (!text) return null;

    let integer: string, fraction = "";
    let match: RegExpMatchArray | null;

    if ((match = text.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/))) { integer = match[1]!.replace(/\./g, ""); fraction = match[2]!; strong = true; }
    else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) return { value: null, problem: "AMBIGUOUS", strong: true }; // "1.234": 1234 or 1,234?
    else if ((match = text.match(/^(\d+),(\d{1,2})$/))) { integer = match[1]!; fraction = match[2]!; strong = true; }
    else if ((match = text.match(/^(\d+)\.(\d{1,2})$/))) { integer = match[1]!; fraction = match[2]!; strong = true; }
    else if (/^\d+$/.test(text)) integer = text;
    else return null;

    integer = integer.replace(/^0+(?=\d)/, "");
    if (integer.length > MAX_INTEGER_DIGITS) return { value: null, problem: "INVALID", strong };

    const value = `${integer}.${fraction.padEnd(2, "0")}`;
    if (/^0+\.00$/.test(value)) return { value: null, problem: "INVALID", strong };

    return { value, problem: null, strong };
}

function toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

// "dd/mm", "dd/mm/aa" or "dd/mm/aaaa". Without a year: this year, or last year if that date is still to come.
function readDate(token: string, today: Date): { value: string | null } | null {
    const match = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (!match) return null;

    const day = Number(match[1]), month = Number(match[2]);
    let year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : today.getUTCFullYear();

    const build = (y: number) => new Date(Date.UTC(y, month - 1, day));
    let date = build(year);
    if (!match[3] && date > today) date = build(--year);

    // Date.UTC rolls 31/02 over to March: compare back to catch dates that do not exist.
    if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return { value: null };

    return { value: toIsoDate(date) };
}

// Finds a multi-word name ("itau black") as consecutive free tokens. Returns the token indexes or null.
function findSequence(tokens: Token[], name: string) {
    const words = normalize(name).split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    for (let start = 0; start + words.length <= tokens.length; start++) {
        if (words.every((word, offset) => !tokens[start + offset]!.used && tokens[start + offset]!.norm === word)) {
            return words.map((_, offset) => start + offset);
        }
    }

    return null;
}

export function parseExpenseMessage(text: string, todayIso: string, cards: ParserCard[], categories: ParserCategory[]): ParsedExpense {
    const today = new Date(todayIso);

    const tokens: Token[] = text.trim().split(/\s+/).filter(Boolean).map(raw => {
        const clean = raw.replace(/^[(\[]+/, "").replace(/[)\].!?;:]+$/, "").replace(/,$/, "");
        return { raw: clean, norm: normalize(clean), used: false };
    }).filter(token => token.raw.length > 0);

    const consumed: number[] = [];
    const use = (index: number) => { tokens[index]!.used = true; consumed.push(index); };

    // Date words and dd/mm
    let date = todayIso, dateProblem = false;
    tokens.forEach((token, index) => {
        if (token.used) return;
        if (token.norm in DATE_WORDS) {
            const shifted = new Date(today);
            shifted.setUTCDate(shifted.getUTCDate() + DATE_WORDS[token.norm]!);
            date = toIsoDate(shifted);
            use(index);
            return;
        }
        const read = readDate(token.norm, today);
        if (read) {
            if (read.value) date = read.value; else dateProblem = true;
            use(index);
        }
    });

    // Amount candidates ("R$" may be a separate token)
    tokens.forEach((token, index) => {
        if (token.used) return;
        if (token.norm === "r$") { use(index); return; }
        const amount = readAmount(token.norm, index > 0 && tokens[index - 1]!.norm === "r$");
        if (amount) token.amount = amount;
    });

    // Card by its last 4 digits, only when it is clearly not the amount ("final 1234", or another amount exists)
    let cardId: string | null = null;
    const amountIndexes = () => tokens.map((token, index) => token.amount && !token.used ? index : -1).filter(index => index >= 0);
    tokens.forEach((token, index) => {
        if (token.used || cardId || !/^\d{4}$/.test(token.norm)) return;
        const card = cards.find(c => c.lastFourDigits === token.norm);
        if (!card) return;
        const previous = index > 0 ? tokens[index - 1]!.norm : "";
        if (previous === "final" || previous === "cartao" || amountIndexes().length > 1) {
            cardId = card.id;
            delete token.amount;
            use(index);
        }
    });

    // Card by name (longest name wins: "Itaú Black" before "Itaú")
    if (!cardId) {
        const byLength = [...cards].sort((a, b) => b.title.length - a.title.length);
        for (const card of byLength) {
            const found = findSequence(tokens, card.title);
            if (found) { cardId = card.id; found.forEach(use); break; }
        }
    }

    // Payment method words
    let paymentMethod: PaymentMethod | null = null;
    tokens.forEach((token, index) => {
        if (token.used || !(token.norm in PAYMENT_WORDS)) return;
        paymentMethod = paymentMethod ?? PAYMENT_WORDS[token.norm]!;
        use(index);
    });
    if (cardId && !paymentMethod) paymentMethod = "CREDIT"; // Only credit purchases have a card
    if (paymentMethod !== null && paymentMethod !== "CREDIT") cardId = null;

    // Pick the amount: the only candidate, or the only "strong" one (has decimals or R$)
    let amount: string | null = null;
    let amountProblem: AmountProblem | null = null;
    const candidates = amountIndexes();
    const strong = candidates.filter(index => tokens[index]!.amount!.strong);
    const chosen = candidates.length === 1 ? candidates : strong;

    if (candidates.length === 0) amountProblem = "MISSING";
    else if (chosen.length !== 1) amountProblem = "MULTIPLE";
    else {
        const token = tokens[chosen[0]!]!;
        if (token.amount!.problem) amountProblem = token.amount!.problem;
        else amount = token.amount!.value;
        use(chosen[0]!);
    }

    // Category named in the message. Its words leave the title only when other words remain:
    // "jantar 120 lazer" -> "Jantar" (Lazer), but "mercado 45" -> "Mercado" (Mercado).
    let categoryId: string | null = null;
    let categoryTokens: number[] = [];
    const byLength = [...categories].sort((a, b) => b.title.length - a.title.length);
    for (const category of byLength) {
        const found = findSequence(tokens, category.title);
        if (found) { categoryId = category.id; categoryTokens = found; break; }
    }

    // Title: the words left, without connectors right before a removed token or at the edges
    for (const index of consumed) {
        for (let before = index - 1; before >= 0 && !tokens[before]!.used && CONNECTORS.has(tokens[before]!.norm); before--) {
            tokens[before]!.used = true;
        }
    }
    const isTitleWord = (token: Token) => !token.used && !CONNECTORS.has(token.norm);
    const othersLeft = tokens.some((token, index) => isTitleWord(token) && !categoryTokens.includes(index));
    if (othersLeft) {
        for (const index of categoryTokens) {
            tokens[index]!.used = true;
            for (let before = index - 1; before >= 0 && !tokens[before]!.used && CONNECTORS.has(tokens[before]!.norm); before--) tokens[before]!.used = true;
        }
    }
    const words = tokens.filter(token => !token.used).map(token => token.raw);
    while (words.length && CONNECTORS.has(normalize(words[0]!))) words.shift();
    while (words.length && CONNECTORS.has(normalize(words[words.length - 1]!))) words.pop();

    let title = words.join(" ").slice(0, 100).trim();
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

    return { title, amount, amountProblem, date, dateProblem, paymentMethod, cardId, categoryId };
}
