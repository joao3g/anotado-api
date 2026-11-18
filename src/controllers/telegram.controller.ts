import { Request, Response } from 'express';
import conversation from '../services/chatbot/conversation.service.js';
import { telegramChannel, parseTelegramUpdate, acknowledgeCallback } from '../services/chatbot/telegram.channel.js';

// Answers 200 at once (Telegram retries failed calls), then handles the update.
// Errors are logged without the message text.
const receiveWebhook = (req: Request, res: Response) => {
    const update = parseTelegramUpdate(req.body);
    res.sendStatus(200);
    if (!update) return;

    void (async () => {
        try {
            if (update.callback) await acknowledgeCallback(update.callback);
            await conversation.handleIncoming(telegramChannel, update.message);
        } catch (error) {
            console.error("[telegramWebhook]: ", error instanceof Error ? error.message : "unknown error");
        }
    })();
}

export default { receiveWebhook };
