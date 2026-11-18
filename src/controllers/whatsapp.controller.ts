import { Request, Response } from 'express';
import conversation from '../services/chatbot/conversation.service.js';
import { whatsappChannel, extractWhatsappMessages } from '../services/chatbot/whatsapp.channel.js';
import { whatsappConfig, isWhatsappEnabled } from '../utils/whatsapp-config.js';

// Meta checks the webhook URL once (when it is saved in the dashboard) with the verify token.
const verifyWebhook = (req: Request, res: Response) => {
    if (!isWhatsappEnabled()) return res.sendStatus(404);

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === whatsappConfig.verifyToken && typeof challenge === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(challenge)) {
        return res.status(200).type("text/plain").send(challenge);
    }

    return res.sendStatus(403);
}

// Answers 200 at once (Meta retries slow answers), then handles the messages one by one.
// Errors are logged without the message text.
const receiveWebhook = (req: Request, res: Response) => {
    const messages = extractWhatsappMessages(req.body);
    res.sendStatus(200);

    void (async () => {
        for (const message of messages) {
            try {
                await conversation.handleIncoming(whatsappChannel, message);
            } catch (error) {
                console.error("[whatsappWebhook]: ", error instanceof Error ? error.message : "unknown error");
            }
        }
    })();
}

export default { verifyWebhook, receiveWebhook };
