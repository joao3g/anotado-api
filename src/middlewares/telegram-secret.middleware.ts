import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { telegramConfig, isTelegramEnabled } from '../utils/telegram-config.js';

// The webhook has no JWT: Telegram is the caller. Every call must carry X-Telegram-Bot-Api-Secret-Token,
// the secret given to Telegram in setWebhook. Calls without it are rejected before anything is read.
export default (req: Request, res: Response, next: NextFunction) => {
    if (!isTelegramEnabled()) return res.sendStatus(404);

    const expected = Buffer.from(telegramConfig.webhookSecret, "utf8");
    const received = Buffer.from(req.get("x-telegram-bot-api-secret-token") ?? "", "utf8");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return res.sendStatus(401);

    next();
}
