// WhatsApp bot: links a WhatsApp number to a user, builds an expense from a message, asks for what is missing,
// and saves only after "Salvar". Saving reuses expenseService.create (group checks, CREDIT invoice date).
import { createHash, randomInt } from 'node:crypto';
import { Prisma, PaymentMethod } from '../generated/prisma/client.js';
import whatsappModel from '../models/whatsapp.model.js';
import userModel from '../models/user.model.js';
import cardModel from '../models/card.model.js';
import categoryModel from '../models/category.model.js';
import expenseModel from '../models/expense.model.js';
import expenseService from './expense.service.js';
import expenseSchema from '../schemas/expense.schema.js';
import api from './whatsapp-api.service.js';
import { parseExpenseMessage, normalize } from '../utils/whatsapp-parser.js';
import { formatBRL } from '../utils/money.js';
import { todayInBrazil, calculateNextInvoiceDate } from '../utils/date.js';
import { whatsappConfig, isWhatsappEnabled } from '../utils/whatsapp-config.js';

const DRAFT_MINUTES = 10;
const LINK_CODE_MINUTES = 10;
const RATE_LIMIT = { messages: 30, minutes: 10 }; // Above this, messages from the number are ignored
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_REGEX = /\bET-?([A-HJ-NP-Z2-9]{8})\b/i;

const PAYMENT_LABEL: Record<PaymentMethod, string> = { DEBIT: "Débito", CREDIT: "Crédito", VOUCHER: "Vale" };

export type IncomingMessage =
    | { id: string, from: string, kind: "text", text: string }
    | { id: string, from: string, kind: "reply", replyId: string }
    | { id: string, from: string, kind: "other" };

type BotUser = { id: string, login: string, name: string | null, groupId: string };
type Context = {
    user: BotUser,
    cards: Awaited<ReturnType<typeof cardModel.listByGroup>>,
    categories: { id: string, title: string }[]
};
type Draft = NonNullable<Awaited<ReturnType<typeof whatsappModel.getDraft>>>;

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const hashCode = (code: string) => createHash("sha256").update(code.toUpperCase()).digest("hex");
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const brDate = (date: Date) => isoDate(date).split("-").reverse().join("/");
const cardLabel = (card: { title: string, lastFourDigits: string | null }) => card.lastFourDigits ? `${card.title} •••• ${card.lastFourDigits}` : card.title;

const HELP_TEXT = [
    "Eu registro as despesas da sua família no Expense Tracker. 💸",
    "",
    "Mande assim:",
    "• mercado 45,90",
    "• uber 23,50 crédito nubank",
    "• farmácia 32 débito ontem",
    "• presente 150 pix 10/11",
    "",
    "Eu mostro um resumo e só salvo depois do *Salvar*.",
    "",
    "Comandos:",
    "• *resumo*: gastos do mês",
    "• *cancelar*: descarta a despesa em andamento",
    "• *desconectar*: desliga este WhatsApp da sua conta"
].join("\n");

// ---------- Webhook payload ----------

// Messages for our phone number only. Status updates (sent/delivered/read) are ignored.
export function extractMessages(body: unknown): IncomingMessage[] {
    const result: IncomingMessage[] = [];
    const entries = (body as { entry?: unknown[] })?.entry;
    if (!Array.isArray(entries)) return result;

    for (const entry of entries) {
        for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
            const value = (change as { field?: string, value?: any })?.field === "messages" ? (change as { value?: any }).value : null;
            if (!value || value.metadata?.phone_number_id !== whatsappConfig.phoneNumberId) continue;

            for (const message of Array.isArray(value.messages) ? value.messages : []) {
                const id = typeof message?.id === "string" ? message.id : null;
                const from = typeof message?.from === "string" && /^[0-9]{8,15}$/.test(message.from) ? message.from : null;
                if (!id || !from) continue;

                if (message.type === "text" && typeof message.text?.body === "string") {
                    result.push({ id, from, kind: "text", text: message.text.body.slice(0, 500) });
                } else if (message.type === "interactive") {
                    const replyId = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
                    result.push(typeof replyId === "string" ? { id, from, kind: "reply", replyId } : { id, from, kind: "other" });
                } else {
                    result.push({ id, from, kind: "other" });
                }
            }
        }
    }

    return result;
}

// ---------- Entry point ----------

export async function handleIncoming(message: IncomingMessage) {
    if (!await whatsappModel.recordInboundMessage(message.id, message.from)) return; // Meta retry: already handled

    // Housekeeping now and then: received ids are only needed for retries and rate limits.
    if (Math.random() < 0.02) await whatsappModel.deleteMessagesBefore(new Date(Date.now() - 30 * 24 * 60 * 60_000));

    if (await whatsappModel.countMessagesSince(message.from, minutesFromNow(-RATE_LIMIT.minutes)) > RATE_LIMIT.messages) return;

    const to = message.from;

    if (message.kind === "text") {
        const code = message.text.match(LINK_CODE_REGEX)?.[1];
        if (code) return await handleLinkCode(to, code);
    }

    const user = await whatsappModel.getUserByWaId(message.from);
    if (!user) {
        // Answer an unknown number at most once a day (every reply is a paid message).
        if (await whatsappModel.countMessagesSince(message.from, minutesFromNow(-24 * 60)) <= 1) {
            await api.sendText(to, "Este número não está conectado ao Expense Tracker. No app, vá em Configurações > Perfil > WhatsApp para conectar.");
        }
        return;
    }

    if (!user.groupId) return await api.sendText(to, "Você ainda não faz parte de uma família. Entre ou crie uma no app e depois volte aqui.");

    const context: Context = {
        user: { ...user, groupId: user.groupId },
        cards: await cardModel.listByGroup(user.groupId),
        categories: (await categoryModel.getByGroupId(user.groupId)).map(category => ({ id: category.id, title: category.title }))
    };

    if (message.kind === "text") return await handleText(to, context, message.text);
    if (message.kind === "reply") return await handleReply(to, context, message.replyId);

    await api.sendText(to, "Por enquanto eu só entendo mensagens de texto. Exemplo: *mercado 45,90*");
}

// ---------- Linking ----------

async function handleLinkCode(to: string, code: string) {
    const user = await whatsappModel.linkWithCode(hashCode(code), to, new Date());

    if (!user) return await api.sendText(to, "Código inválido ou expirado. Gere um novo no app, em Configurações > Perfil > WhatsApp.");

    const greeting = `✅ Pronto${user.name ? `, ${user.name}` : ""}! Este WhatsApp está conectado à sua conta.`;
    const noFamily = user.groupId ? "" : "\n\nVocê ainda não faz parte de uma família: entre ou crie uma no app para registrar despesas.";

    await api.sendText(to, `${greeting}${noFamily}\n\n${HELP_TEXT}`);
}

// Code shown in the app. The user sends it to the bot, which proves the WhatsApp number is theirs.
export async function createLinkCode(login: string) {
    const user = await userModel.getByLogin(login);
    if (!user) throw new Error("User not found!");

    const code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const expiresAt = minutesFromNow(LINK_CODE_MINUTES);

    await whatsappModel.saveLinkCode(user.id, hashCode(code), expiresAt);

    const message = `Conectar ET-${code}`;
    const link = whatsappConfig.displayNumber ? `https://wa.me/${whatsappConfig.displayNumber}?text=${encodeURIComponent(message)}` : null;

    return { code: `ET-${code}`, message, link, expiresAt };
}

export async function unlinkByLogin(login: string) {
    const user = await userModel.getByLogin(login);
    if (!user) throw new Error("User not found!");

    await whatsappModel.unlink(user.id);
}

export async function getStatus(login: string) {
    const user = await userModel.getByLogin(login);
    if (!user) throw new Error("User not found!");

    const waId = await whatsappModel.getWaIdByUserId(user.id);

    return {
        enabled: isWhatsappEnabled(),
        connected: Boolean(waId),
        lastDigits: waId ? waId.slice(-4) : null, // Never the full number
        botNumber: whatsappConfig.displayNumber || null
    };
}

// ---------- Text messages ----------

async function handleText(to: string, context: Context, text: string) {
    const command = normalize(text).replace(/[!?.]+$/, "");

    if (["ajuda", "help", "menu", "oi", "ola", "comandos", "?"].includes(command)) return await api.sendText(to, HELP_TEXT);
    if (["resumo", "total", "gastos", "saldo"].includes(command) || command.startsWith("quanto gastei")) return await sendSummary(to, context);
    if (command === "cancelar") {
        await whatsappModel.deleteDraft(context.user.id);
        return await api.sendText(to, "Ok, nada foi salvo.");
    }
    if (command === "desconectar") {
        await whatsappModel.unlink(context.user.id);
        return await api.sendText(to, "Este WhatsApp foi desconectado da sua conta. Para conectar de novo, use o app.");
    }

    const today = isoDate(todayInBrazil());
    const parsed = parseExpenseMessage(text, today, context.cards, context.categories);

    // No amount while a draft waits for its category: the text may be the category name.
    if (parsed.amountProblem === "MISSING") {
        const draft = await getValidDraft(context.user.id);
        if (draft && draft.paymentMethod && (draft.paymentMethod !== "CREDIT" || draft.cardId) && !draft.categoryId) {
            const wanted = normalize(text);
            const category = context.categories.find(c => normalize(c.title) === wanted)
                ?? context.categories.find(c => normalize(c.title).includes(wanted) || wanted.includes(normalize(c.title)));
            if (!category) return await api.sendText(to, "Não encontrei essa categoria. Escolha na lista acima ou digite o nome exato.");

            await whatsappModel.updateDraft(draft.id, context.user.id, { categoryId: category.id, expiresAt: minutesFromNow(DRAFT_MINUTES) });
            return await continueDraft(to, context);
        }
    }

    switch (parsed.amountProblem) {
        case "MISSING": return await api.sendText(to, "Não achei o valor. Exemplo: *mercado 45,90*\n\nMande *ajuda* para ver mais exemplos.");
        case "AMBIGUOUS": return await api.sendText(to, "Não entendi o valor: escreva com centavos, por exemplo *1.234,00* ou *1234*.");
        case "MULTIPLE": return await api.sendText(to, "Achei mais de um número. Escreva o valor com centavos (ex.: *45,90*) ou com R$ (ex.: *R$ 45*).");
        case "INVALID": return await api.sendText(to, "Valor inválido: precisa ser maior que zero e menor que R$ 100 milhões.");
    }
    if (parsed.dateProblem) return await api.sendText(to, "Essa data não existe. Use dia/mês, por exemplo *25/12*, ou *ontem*.");

    // Fill what was not typed with the latest expense of the same title (category, payment method, card).
    const history = parsed.title ? await expenseModel.getLatestByTitleInGroup(parsed.title, context.user.groupId) : null;
    const cardExists = (id: string | null | undefined) => Boolean(id && context.cards.some(card => card.id === id));
    const categoryExists = (id: string | null | undefined) => Boolean(id && context.categories.some(category => category.id === id));

    const paymentMethod: PaymentMethod | null = parsed.paymentMethod ?? history?.paymentMethod ?? null;
    let cardId: string | null = null;
    if (paymentMethod === "CREDIT") {
        if (parsed.cardId) cardId = parsed.cardId;
        else if (history?.paymentMethod === "CREDIT" && cardExists(history.cardId)) cardId = history.cardId;
        else if (context.cards.length === 1) cardId = context.cards[0]!.id;
    }
    const categoryId = parsed.categoryId ?? (categoryExists(history?.categoryId) ? history!.categoryId : null);

    await whatsappModel.replaceDraft(context.user.id, {
        title: parsed.title,
        amount: parsed.amount!,
        date: new Date(parsed.date),
        paymentMethod,
        cardId,
        categoryId,
        expiresAt: minutesFromNow(DRAFT_MINUTES)
    });

    await continueDraft(to, context);
}

async function getValidDraft(userId: string) {
    const draft = await whatsappModel.getDraft(userId);
    return draft && draft.expiresAt > new Date() ? draft : null;
}

// Asks for the next missing field, or shows the summary with "Salvar".
async function continueDraft(to: string, context: Context) {
    const draft = await getValidDraft(context.user.id);
    if (!draft) return await api.sendText(to, "Essa despesa expirou. Mande de novo, por exemplo: *mercado 45,90*");

    const head = `*${draft.title || "Despesa"}*: ${formatBRL(draft.amount.toFixed(2))}`;

    if (!draft.paymentMethod) {
        return await api.sendButtons(to, `${head}\n\nComo foi pago?`, [
            { id: `pay:${draft.id}:DEBIT`, title: "Débito / Pix" },
            { id: `pay:${draft.id}:CREDIT`, title: "Crédito" },
            { id: `pay:${draft.id}:VOUCHER`, title: "Vale" }
        ]);
    }

    if (draft.paymentMethod === "CREDIT" && !draft.cardId) {
        if (context.cards.length === 0) {
            await whatsappModel.deleteDraft(context.user.id);
            return await api.sendText(to, "Sua família ainda não tem cartões. Cadastre um em *Cartões* no app, ou mande de novo com *débito*.");
        }
        const options = context.cards.map(card => ({ id: `card:${draft.id}:${card.id}`, title: cardLabel(card) }));
        return options.length <= 3
            ? await api.sendButtons(to, `${head}\n\nQual cartão?`, options)
            : await api.sendList(to, `${head}\n\nQual cartão?`, "Escolher cartão", options);
    }

    if (!draft.categoryId) {
        if (context.categories.length === 0) {
            await whatsappModel.deleteDraft(context.user.id);
            return await api.sendText(to, "Sua família ainda não tem categorias. Cadastre uma em *Categorias* no app e mande de novo.");
        }
        const categories = await mostUsedCategories(context);
        const more = context.categories.length > 10 ? "\n\nNão está na lista? Digite o nome da categoria." : "";
        return await api.sendList(to, `${head}\n\nQual categoria?${more}`, "Escolher categoria",
            categories.map(category => ({ id: `cat:${draft.id}:${category.id}`, title: category.title })));
    }

    await api.sendButtons(to, summaryText(draft, context), [
        { id: `save:${draft.id}:`, title: "Salvar" },
        { id: `cancel:${draft.id}:`, title: "Cancelar" }
    ]);
}

// Up to 10 categories (a WhatsApp list limit): the most used in the last 90 days first, then by name.
async function mostUsedCategories(context: Context) {
    const sorted = [...context.categories].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    if (sorted.length <= 10) return sorted;

    const usage = await expenseModel.countByCategorySince(context.user.groupId, new Date(Date.now() - 90 * 24 * 60 * 60_000));
    const countById = new Map(usage.map(item => [item.categoryId, item._count._all]));

    return sorted.sort((a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0)).slice(0, 10);
}

function summaryText(draft: Draft, context: Context) {
    const category = context.categories.find(c => c.id === draft.categoryId);
    const card = context.cards.find(c => c.id === draft.cardId);
    const title = draft.title || category?.title || "Despesa";

    const lines = [
        "Confere?",
        "",
        `*${title}*`,
        `💰 ${formatBRL(draft.amount.toFixed(2))}`,
        `📅 ${brDate(draft.date)}`,
        `💳 ${PAYMENT_LABEL[draft.paymentMethod!]}${card ? ` · ${cardLabel(card)}` : ""}`
    ];
    if (card) lines.push(`🧾 Fatura de ${brDate(calculateNextInvoiceDate(draft.date, card.closingDay))}`);
    lines.push(`🏷️ ${category?.title ?? "Sem categoria"}`);

    return lines.join("\n");
}

// ---------- Button and list answers ----------

async function handleReply(to: string, context: Context, replyId: string) {
    const [action, draftId, value] = replyId.split(":");
    const draft = await getValidDraft(context.user.id);

    // Old buttons (the draft was saved, canceled, replaced or expired) do nothing.
    if (!draft || draft.id !== draftId) return await api.sendText(to, "Essa opção não vale mais. Mande a despesa de novo, por exemplo: *mercado 45,90*");

    const expiresAt = minutesFromNow(DRAFT_MINUTES);

    switch (action) {
        case "pay": {
            if (value !== "DEBIT" && value !== "CREDIT" && value !== "VOUCHER") return;
            const cardId = value === "CREDIT" && context.cards.length === 1 ? context.cards[0]!.id : null;
            await whatsappModel.updateDraft(draft.id, context.user.id, { paymentMethod: value, cardId, expiresAt });
            return await continueDraft(to, context);
        }
        case "card": {
            if (!context.cards.some(card => card.id === value)) return await continueDraft(to, context);
            await whatsappModel.updateDraft(draft.id, context.user.id, { paymentMethod: "CREDIT", cardId: value!, expiresAt });
            return await continueDraft(to, context);
        }
        case "cat": {
            if (!context.categories.some(category => category.id === value)) return await continueDraft(to, context);
            await whatsappModel.updateDraft(draft.id, context.user.id, { categoryId: value!, expiresAt });
            return await continueDraft(to, context);
        }
        case "cancel": {
            await whatsappModel.takeDraft(draft.id, context.user.id);
            return await api.sendText(to, "Ok, nada foi salvo.");
        }
        case "save":
            return await saveDraft(to, context, draft);
    }
}

async function saveDraft(to: string, context: Context, draft: Draft) {
    if (!draft.paymentMethod || !draft.categoryId || (draft.paymentMethod === "CREDIT" && !draft.cardId)) return await continueDraft(to, context);

    // Taken first: a second "Salvar" (double tap, or Meta retry with a new id) finds nothing to save.
    if (!await whatsappModel.takeDraft(draft.id, context.user.id)) return;

    const category = context.categories.find(c => c.id === draft.categoryId);
    const data = {
        title: draft.title || category?.title || "Despesa",
        amount: Number(draft.amount.toFixed(2)), // Same JSON number the app's form sends; at most 2 decimals
        date: isoDate(draft.date),
        paymentMethod: draft.paymentMethod,
        category: draft.categoryId,
        ...(draft.paymentMethod === "CREDIT" && draft.cardId ? { card: draft.cardId } : {})
    };

    // Same validation as POST /expense.
    const parsed = expenseSchema.create.safeParse(data);
    if (!parsed.success) return await api.sendText(to, "Não consegui salvar essa despesa. Confira os dados e mande de novo.");

    const created = await expenseService.create(context.user.login, parsed.data);
    if (!created) return await api.sendText(to, "Não consegui salvar: a categoria ou o cartão não existe mais na sua família. Mande de novo.");

    await api.sendText(to, `✅ Salvo! *${data.title}*: ${formatBRL(draft.amount.toFixed(2))}`);
}

// ---------- Summary ----------

async function sendSummary(to: string, context: Context) {
    const today = todayInBrazil();
    const summary = await expenseService.getSummarizedByMonth(context.user.login, { date: isoDate(today) });

    const items = summary.summarizedByCategory
        .map(item => ({ title: item.categoryTitle ?? "Sem categoria", amount: item._sum.amount ?? new Prisma.Decimal(0) }))
        .sort((a, b) => b.amount.comparedTo(a.amount));
    const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));

    const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(today);
    const lines = [`📊 *${month.charAt(0).toUpperCase()}${month.slice(1)}* (pelo vencimento)`, `Total: *${formatBRL(total.toFixed(2))}*`];

    if (items.length) {
        lines.push("", "Por categoria:");
        for (const item of items.slice(0, 8)) lines.push(`• ${item.title}: ${formatBRL(item.amount.toFixed(2))}`);
        if (items.length > 8) lines.push(`• e mais ${items.length - 8}`);
    }

    await api.sendText(to, lines.join("\n"));
}

export default { extractMessages, handleIncoming, createLinkCode, unlinkByLogin, getStatus };
