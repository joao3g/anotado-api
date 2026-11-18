// WhatsApp Cloud API channel: reads webhook payloads and sends texts, buttons and lists.
// Errors are logged with the status and Meta's error code only, never the message text or the token.
import { whatsappConfig } from '../../utils/whatsapp-config.js';
import { ChatChannel, Choice, IncomingMessage } from './types.js';

const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

async function send(to: string, payload: Record<string, unknown>) {
    try {
        const response = await fetch(`${whatsappConfig.apiBaseUrl}/${whatsappConfig.phoneNumberId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${whatsappConfig.token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            const data = await response.json().catch(() => null) as { error?: { code?: number, error_subcode?: number } } | null;
            console.error("[whatsappSend]: ", response.status, data?.error?.code ?? "", data?.error?.error_subcode ?? "");
        }
    } catch (error) {
        console.error("[whatsappSend]: ", error instanceof Error ? error.name : "unknown error");
    }
}

export const whatsappChannel: ChatChannel = {
    name: "whatsapp",
    label: "WhatsApp",
    idPrefix: "wa",
    commandPrefix: "",
    maxListChoices: 10,

    sendText: (to, text) => send(to, { type: "text", text: { body: cut(text, 4096), preview_url: false } }),

    sendButtons: (to, text, choices: Choice[]) => send(to, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: cut(text, 1024) },
            action: { buttons: choices.slice(0, 3).map(choice => ({ type: "reply", reply: { id: choice.id, title: cut(choice.title, 20) } })) }
        }
    }),

    sendList: (to, text, buttonText, choices: Choice[]) => send(to, {
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: cut(text, 1024) },
            action: {
                button: cut(buttonText, 20),
                sections: [{ title: cut(buttonText, 24), rows: choices.slice(0, 10).map(choice => ({ id: choice.id, title: cut(choice.title, 24) })) }]
            }
        }
    })
};

// Messages for our phone number only. Status updates (sent/delivered/read) are ignored.
export function extractWhatsappMessages(body: unknown): IncomingMessage[] {
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
