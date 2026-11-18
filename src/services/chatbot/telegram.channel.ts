// Telegram Bot API channel: reads webhook updates (private chats only), sends texts and inline buttons,
// and registers the webhook and the command menu at startup.
// The bot token is part of every API URL: never log URLs or the token. Errors log the method and Telegram's description only.
import { telegramConfig, isTelegramEnabled } from '../../utils/telegram-config.js';
import { ChatChannel, Choice, IncomingMessage } from './types.js';

const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

// Texts use *bold* (WhatsApp style). Telegram gets safe HTML: escape first, then turn *x* into <b>x</b>.
export const toTelegramHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*([^*\n]+)\*/g, "<b>$1</b>");

async function callApi(method: string, payload: Record<string, unknown>) {
    try {
        const response = await fetch(`${telegramConfig.apiBaseUrl}/bot${telegramConfig.token}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        const data = await response.json().catch(() => null) as { ok?: boolean, description?: string } | null;

        if (!response.ok || data?.ok === false) {
            console.error(`[telegram ${method}]: `, response.status, cut(data?.description ?? "", 120));
            return false;
        }
        return true;
    } catch (error) {
        console.error(`[telegram ${method}]: `, error instanceof Error ? error.name : "unknown error");
        return false;
    }
}

const sendMessage = async (chatId: string, text: string, keyboard?: Choice[][]) => {
    await callApi("sendMessage", {
        chat_id: chatId,
        text: cut(toTelegramHtml(text), 4096),
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard.map(row => row.map(choice => ({ text: cut(choice.title, 40), callback_data: choice.id }))) } } : {})
    });
}

export const telegramChannel: ChatChannel = {
    name: "telegram",
    label: "Telegram",
    idPrefix: "tg",
    commandPrefix: "/",
    maxListChoices: 40,

    sendText: (to, text) => sendMessage(to, text),
    sendButtons: (to, text, choices) => sendMessage(to, text, [choices.slice(0, 3)]),
    // Two buttons per row, so category names stay readable on phones.
    sendList: (to, text, _buttonText, choices) => {
        const rows: Choice[][] = [];
        for (let index = 0; index < choices.length; index += 2) rows.push(choices.slice(index, index + 2));
        return sendMessage(to, text, rows);
    }
};

export type TelegramUpdate = { message: IncomingMessage, callback?: { queryId: string, chatId: string, messageId: number } };

// Private chats with people only (groups, channels and other bots are ignored).
export function parseTelegramUpdate(update: any): TelegramUpdate | null {
    if (typeof update?.update_id !== "number") return null;
    const id = String(update.update_id);

    const message = update.message;
    if (message) {
        if (message.chat?.type !== "private" || message.from?.is_bot || typeof message.from?.id !== "number") return null;
        const from = String(message.from.id);

        return typeof message.text === "string"
            ? { message: { id, from, kind: "text", text: message.text.slice(0, 500) } }
            : { message: { id, from, kind: "other" } };
    }

    const query = update.callback_query;
    if (query) {
        if (query.message?.chat?.type !== "private" || typeof query.from?.id !== "number" || typeof query.data !== "string") return null;

        return {
            message: { id, from: String(query.from.id), kind: "reply", replyId: query.data },
            callback: { queryId: String(query.id), chatId: String(query.message.chat.id), messageId: query.message.message_id }
        };
    }

    return null;
}

// Stops the button's loading spinner and removes the buttons from that message, so they cannot be tapped again.
export async function acknowledgeCallback(callback: NonNullable<TelegramUpdate["callback"]>) {
    await callApi("answerCallbackQuery", { callback_query_id: callback.queryId });
    await callApi("editMessageReplyMarkup", { chat_id: callback.chatId, message_id: callback.messageId, reply_markup: { inline_keyboard: [] } });
}

// Points Telegram to this API and sets the command menu. Safe to run on every start (Telegram keeps the latest call).
export async function registerTelegramWebhook() {
    if (!isTelegramEnabled()) return;
    if (!telegramConfig.publicUrl) return console.log("[telegram]: no public URL (RENDER_EXTERNAL_URL / TELEGRAM_WEBHOOK_BASE_URL); webhook not registered");

    const webhookOk = await callApi("setWebhook", {
        url: `${telegramConfig.publicUrl}/telegram/webhook`,
        secret_token: telegramConfig.webhookSecret,
        allowed_updates: ["message", "callback_query"],
        max_connections: 10
    });

    await callApi("setMyCommands", {
        commands: [
            { command: "resumo", description: "Gastos do mês" },
            { command: "cancelar", description: "Descartar a despesa em andamento" },
            { command: "desconectar", description: "Desligar este Telegram da sua conta" },
            { command: "ajuda", description: "Como usar o bot" }
        ]
    });

    console.log(`[telegram]: webhook ${webhookOk ? "registered" : "NOT registered"}`);
}
