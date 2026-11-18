// Bot conversation, the same for every messaging app (WhatsApp, Telegram): links an account with a code,
// builds an expense from a message, asks for what is missing, and saves only after "Salvar".
// Saving reuses expenseService.create (group checks, CREDIT invoice date).
import { createHash } from 'node:crypto';
import { Prisma, PaymentMethod } from '../../generated/prisma/client.js';
import botModel from '../../models/bot.model.js';
import cardModel from '../../models/card.model.js';
import categoryModel from '../../models/category.model.js';
import expenseModel from '../../models/expense.model.js';
import expenseService from '../expense.service.js';
import expenseSchema from '../../schemas/expense.schema.js';
import { parseExpenseMessage, normalize } from '../../utils/expense-message-parser.js';
import { formatBRL } from '../../utils/money.js';
import { todayInBrazil, calculateNextInvoiceDate } from '../../utils/date.js';
import { ChatChannel, Choice, IncomingMessage } from './types.js';

const DRAFT_MINUTES = 10;
const RATE_LIMIT = { messages: 30, minutes: 10 }; // Above this, messages from the sender are ignored
export const LINK_CODE_REGEX = /\bET-?([A-HJ-NP-Z2-9]{8})\b/i;

const PAYMENT_LABEL: Record<PaymentMethod, string> = { DEBIT: "Débito", CREDIT: "Crédito", VOUCHER: "Vale" };

type BotUser = { id: string, login: string, name: string | null, groupId: string };
type Context = {
    channel: ChatChannel,
    to: string,
    user: BotUser,
    cards: Awaited<ReturnType<typeof cardModel.listByGroup>>,
    categories: { id: string, title: string }[]
};
type Draft = NonNullable<Awaited<ReturnType<typeof botModel.getDraft>>>;

// "ET-K7MZQ2PA", "etk7mzq2pa" and "K7MZQ2PA" are the same code: only the 8 characters are hashed.
export const hashLinkCode = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/^ET-?/, "")).digest("hex");
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const brDate = (date: Date) => isoDate(date).split("-").reverse().join("/");
// Values typed by people go inside formatted texts: drop the formatting marks so they cannot break them.
const plain = (text: string) => text.replace(/[*_~`]/g, "");
const cardLabel = (card: { title: string, lastFourDigits: string | null }) => plain(card.lastFourDigits ? `${card.title} •••• ${card.lastFourDigits}` : card.title);

// Button ids carry the first 8 chars of the draft id (Telegram allows 64 bytes): "cat:1a2b3c4d:<category uuid>".
const choiceId = (action: string, draft: Draft, value = "") => `${action}:${draft.id.slice(0, 8)}:${value}`;

function helpText(channel: ChatChannel) {
    const c = channel.commandPrefix;
    return [
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
        `• *${c}resumo*: gastos do mês`,
        `• *${c}cancelar*: descarta a despesa em andamento`,
        `• *${c}desconectar*: desliga este ${channel.label} da sua conta`
    ].join("\n");
}

const notConnectedText = (channel: ChatChannel) =>
    `Este ${channel.label} não está conectado ao Expense Tracker. No app, vá em Configurações > Perfil > Bots de mensagem para conectar.`;

// "/resumo@MeuBot" -> "resumo", "Ajuda!" -> "ajuda"
const commandOf = (text: string) => normalize(text).replace(/^\//, "").replace(/@\w+/, "").replace(/[!?.]+$/, "").trim();

// ---------- Entry point ----------

export async function handleIncoming(channel: ChatChannel, message: IncomingMessage) {
    const sender = `${channel.idPrefix}:${message.from}`;
    if (!await botModel.recordInboundMessage(`${channel.idPrefix}:${message.id}`, sender)) return; // Retry: already handled

    // Housekeeping now and then: received ids are only needed for retries and rate limits.
    if (Math.random() < 0.02) await botModel.deleteMessagesBefore(new Date(Date.now() - 30 * 24 * 60 * 60_000));

    if (await botModel.countMessagesSince(sender, minutesFromNow(-RATE_LIMIT.minutes)) > RATE_LIMIT.messages) return;

    const to = message.from;

    if (message.kind === "text") {
        const code = message.text.match(LINK_CODE_REGEX)?.[1];
        if (code) return await handleLinkCode(channel, to, code);
    }

    const user = await botModel.getUserByChannelId(channel.name, message.from);
    if (!user) {
        // "/start" (Telegram's first message) always gets an answer; anything else at most once a day.
        const isStart = message.kind === "text" && commandOf(message.text) === "start";
        if (isStart || await botModel.countMessagesSince(sender, minutesFromNow(-24 * 60)) <= 1) await channel.sendText(to, notConnectedText(channel));
        return;
    }

    if (!user.groupId) return await channel.sendText(to, "Você ainda não faz parte de uma família. Entre ou crie uma no app e depois volte aqui.");

    const context: Context = {
        channel,
        to,
        user: { ...user, groupId: user.groupId },
        cards: await cardModel.listByGroup(user.groupId),
        categories: (await categoryModel.getByGroupId(user.groupId)).map(category => ({ id: category.id, title: category.title }))
    };

    if (message.kind === "text") return await handleText(context, message.text);
    if (message.kind === "reply") return await handleReply(context, message.replyId);

    await channel.sendText(to, "Por enquanto eu só entendo mensagens de texto. Exemplo: *mercado 45,90*");
}

// ---------- Linking ----------

async function handleLinkCode(channel: ChatChannel, to: string, code: string) {
    const user = await botModel.linkWithCode(hashLinkCode(code), channel.name, to, new Date());

    if (!user) return await channel.sendText(to, "Código inválido ou expirado. Gere um novo no app, em Configurações > Perfil > Bots de mensagem.");

    const greeting = `✅ Pronto${user.name ? `, ${plain(user.name)}` : ""}! Este ${channel.label} está conectado à sua conta.`;
    const noFamily = user.groupId ? "" : "\n\nVocê ainda não faz parte de uma família: entre ou crie uma no app para registrar despesas.";

    await channel.sendText(to, `${greeting}${noFamily}\n\n${helpText(channel)}`);
}

// ---------- Text messages ----------

async function handleText(context: Context, text: string) {
    const { channel, to } = context;
    const command = commandOf(text);

    if (["ajuda", "help", "menu", "oi", "ola", "comandos", "start", ""].includes(command)) return await channel.sendText(to, helpText(channel));
    if (["resumo", "total", "gastos", "saldo"].includes(command) || command.startsWith("quanto gastei")) return await sendSummary(context);
    if (command === "cancelar") {
        await botModel.deleteDraft(context.user.id);
        return await channel.sendText(to, "Ok, nada foi salvo.");
    }
    if (command === "desconectar") {
        await botModel.unlink(context.user.id, channel.name);
        return await channel.sendText(to, `Este ${channel.label} foi desconectado da sua conta. Para conectar de novo, use o app.`);
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
            if (!category) return await channel.sendText(to, "Não encontrei essa categoria. Escolha nos botões acima ou digite o nome exato.");

            await botModel.updateDraft(draft.id, context.user.id, { categoryId: category.id, expiresAt: minutesFromNow(DRAFT_MINUTES) });
            return await continueDraft(context);
        }
    }

    const help = `${channel.commandPrefix}ajuda`;
    switch (parsed.amountProblem) {
        case "MISSING": return await channel.sendText(to, `Não achei o valor. Exemplo: *mercado 45,90*\n\nMande *${help}* para ver mais exemplos.`);
        case "AMBIGUOUS": return await channel.sendText(to, "Não entendi o valor: escreva com centavos, por exemplo *1.234,00* ou *1234*.");
        case "MULTIPLE": return await channel.sendText(to, "Achei mais de um número. Escreva o valor com centavos (ex.: *45,90*) ou com R$ (ex.: *R$ 45*).");
        case "INVALID": return await channel.sendText(to, "Valor inválido: precisa ser maior que zero e menor que R$ 100 milhões.");
    }
    if (parsed.dateProblem) return await channel.sendText(to, "Essa data não existe. Use dia/mês, por exemplo *25/12*, ou *ontem*.");

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

    await botModel.replaceDraft(context.user.id, {
        title: parsed.title,
        amount: parsed.amount!,
        date: new Date(parsed.date),
        paymentMethod,
        cardId,
        categoryId,
        expiresAt: minutesFromNow(DRAFT_MINUTES)
    });

    await continueDraft(context);
}

async function getValidDraft(userId: string) {
    const draft = await botModel.getDraft(userId);
    return draft && draft.expiresAt > new Date() ? draft : null;
}

// Asks for the next missing field, or shows the summary with "Salvar".
async function continueDraft(context: Context) {
    const { channel, to } = context;
    const draft = await getValidDraft(context.user.id);
    if (!draft) return await channel.sendText(to, "Essa despesa expirou. Mande de novo, por exemplo: *mercado 45,90*");

    const head = `*${plain(draft.title) || "Despesa"}*: ${formatBRL(draft.amount.toFixed(2))}`;

    if (!draft.paymentMethod) {
        return await channel.sendButtons(to, `${head}\n\nComo foi pago?`, [
            { id: choiceId("pay", draft, "DEBIT"), title: "Débito / Pix" },
            { id: choiceId("pay", draft, "CREDIT"), title: "Crédito" },
            { id: choiceId("pay", draft, "VOUCHER"), title: "Vale" }
        ]);
    }

    if (draft.paymentMethod === "CREDIT" && !draft.cardId) {
        if (context.cards.length === 0) {
            await botModel.deleteDraft(context.user.id);
            return await channel.sendText(to, "Sua família ainda não tem cartões. Cadastre um em *Cartões* no app, ou mande de novo com *débito*.");
        }
        const options: Choice[] = context.cards.map(card => ({ id: choiceId("card", draft, card.id), title: cardLabel(card) }));
        return options.length <= 3
            ? await channel.sendButtons(to, `${head}\n\nQual cartão?`, options)
            : await channel.sendList(to, `${head}\n\nQual cartão?`, "Escolher cartão", options.slice(0, channel.maxListChoices));
    }

    if (!draft.categoryId) {
        if (context.categories.length === 0) {
            await botModel.deleteDraft(context.user.id);
            return await channel.sendText(to, "Sua família ainda não tem categorias. Cadastre uma em *Categorias* no app e mande de novo.");
        }
        const categories = await mostUsedCategories(context, channel.maxListChoices);
        const more = context.categories.length > channel.maxListChoices ? "\n\nNão está na lista? Digite o nome da categoria." : "";
        return await channel.sendList(to, `${head}\n\nQual categoria?${more}`, "Escolher categoria",
            categories.map(category => ({ id: choiceId("cat", draft, category.id), title: plain(category.title) })));
    }

    await channel.sendButtons(to, summaryText(draft, context), [
        { id: choiceId("save", draft), title: "Salvar" },
        { id: choiceId("cancel", draft), title: "Cancelar" }
    ]);
}

// The most used categories in the last 90 days first, then by name, up to `limit` (a channel limit).
async function mostUsedCategories(context: Context, limit: number) {
    const sorted = [...context.categories].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    if (sorted.length <= limit) return sorted;

    const usage = await expenseModel.countByCategorySince(context.user.groupId, new Date(Date.now() - 90 * 24 * 60 * 60_000));
    const countById = new Map(usage.map(item => [item.categoryId, item._count._all]));

    return sorted.sort((a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0)).slice(0, limit);
}

function summaryText(draft: Draft, context: Context) {
    const category = context.categories.find(c => c.id === draft.categoryId);
    const card = context.cards.find(c => c.id === draft.cardId);
    const title = plain(draft.title || category?.title || "Despesa");

    const lines = [
        "Confere?",
        "",
        `*${title}*`,
        `💰 ${formatBRL(draft.amount.toFixed(2))}`,
        `📅 ${brDate(draft.date)}`,
        `💳 ${PAYMENT_LABEL[draft.paymentMethod!]}${card ? ` · ${cardLabel(card)}` : ""}`
    ];
    if (card) lines.push(`🧾 Fatura de ${brDate(calculateNextInvoiceDate(draft.date, card.closingDay))}`);
    lines.push(`🏷️ ${plain(category?.title ?? "Sem categoria")}`);

    return lines.join("\n");
}

// ---------- Button answers ----------

async function handleReply(context: Context, replyId: string) {
    const { channel, to } = context;
    const [action, draftPrefix, value] = replyId.split(":");
    const draft = await getValidDraft(context.user.id);

    // Old buttons (the draft was saved, canceled, replaced or expired) do nothing.
    if (!draft || !draftPrefix || draftPrefix.length !== 8 || !draft.id.startsWith(draftPrefix)) {
        return await channel.sendText(to, "Essa opção não vale mais. Mande a despesa de novo, por exemplo: *mercado 45,90*");
    }

    const expiresAt = minutesFromNow(DRAFT_MINUTES);

    switch (action) {
        case "pay": {
            if (value !== "DEBIT" && value !== "CREDIT" && value !== "VOUCHER") return;
            const cardId = value === "CREDIT" && context.cards.length === 1 ? context.cards[0]!.id : null;
            await botModel.updateDraft(draft.id, context.user.id, { paymentMethod: value, cardId, expiresAt });
            return await continueDraft(context);
        }
        case "card": {
            if (!context.cards.some(card => card.id === value)) return await continueDraft(context);
            await botModel.updateDraft(draft.id, context.user.id, { paymentMethod: "CREDIT", cardId: value!, expiresAt });
            return await continueDraft(context);
        }
        case "cat": {
            if (!context.categories.some(category => category.id === value)) return await continueDraft(context);
            await botModel.updateDraft(draft.id, context.user.id, { categoryId: value!, expiresAt });
            return await continueDraft(context);
        }
        case "cancel": {
            await botModel.takeDraft(draft.id, context.user.id);
            return await channel.sendText(to, "Ok, nada foi salvo.");
        }
        case "save":
            return await saveDraft(context, draft);
    }
}

async function saveDraft(context: Context, draft: Draft) {
    const { channel, to } = context;
    if (!draft.paymentMethod || !draft.categoryId || (draft.paymentMethod === "CREDIT" && !draft.cardId)) return await continueDraft(context);

    // Taken first: a second "Salvar" (double tap, or a retry) finds nothing to save.
    if (!await botModel.takeDraft(draft.id, context.user.id)) return;

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
    if (!parsed.success) return await channel.sendText(to, "Não consegui salvar essa despesa. Confira os dados e mande de novo.");

    const created = await expenseService.create(context.user.login, parsed.data);
    if (!created) return await channel.sendText(to, "Não consegui salvar: a categoria ou o cartão não existe mais na sua família. Mande de novo.");

    await channel.sendText(to, `✅ Salvo! *${plain(data.title)}*: ${formatBRL(draft.amount.toFixed(2))}`);
}

// ---------- Summary ----------

async function sendSummary(context: Context) {
    const today = todayInBrazil();
    const summary = await expenseService.getSummarizedByMonth(context.user.login, { date: isoDate(today) });

    const items = summary.summarizedByCategory
        .map(item => ({ title: plain(item.categoryTitle ?? "Sem categoria"), amount: item._sum.amount ?? new Prisma.Decimal(0) }))
        .sort((a, b) => b.amount.comparedTo(a.amount));
    const total = items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));

    const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(today);
    const lines = [`📊 *${month.charAt(0).toUpperCase()}${month.slice(1)}* (pelo vencimento)`, `Total: *${formatBRL(total.toFixed(2))}*`];

    if (items.length) {
        lines.push("", "Por categoria:");
        for (const item of items.slice(0, 8)) lines.push(`• ${item.title}: ${formatBRL(item.amount.toFixed(2))}`);
        if (items.length > 8) lines.push(`• e mais ${items.length - 8}`);
    }

    await context.channel.sendText(context.to, lines.join("\n"));
}

export default { handleIncoming };
