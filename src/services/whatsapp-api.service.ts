// Sends messages with the WhatsApp Cloud API. Errors are logged with the status and Meta's error code only,
// never the message text (it has financial data) or the token.
import { whatsappConfig } from '../utils/whatsapp-config.js';

export type ReplyButton = { id: string, title: string }; // title: max 20 chars
export type ListRow = { id: string, title: string, description?: string }; // title: max 24, description: max 72

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

const sendText = (to: string, body: string) =>
    send(to, { type: "text", text: { body: cut(body, 4096), preview_url: false } });

// Up to 3 buttons.
const sendButtons = (to: string, body: string, buttons: ReplyButton[]) =>
    send(to, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: cut(body, 1024) },
            action: { buttons: buttons.slice(0, 3).map(button => ({ type: "reply", reply: { id: button.id, title: cut(button.title, 20) } })) }
        }
    });

// Up to 10 rows.
const sendList = (to: string, body: string, buttonText: string, rows: ListRow[]) =>
    send(to, {
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: cut(body, 1024) },
            action: {
                button: cut(buttonText, 20),
                sections: [{
                    title: cut(buttonText, 24),
                    rows: rows.slice(0, 10).map(row => ({
                        id: row.id,
                        title: cut(row.title, 24),
                        ...(row.description ? { description: cut(row.description, 72) } : {})
                    }))
                }]
            }
        }
    });

export default { sendText, sendButtons, sendList };
