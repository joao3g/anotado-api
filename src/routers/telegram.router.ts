import express from 'express';
import TelegramController from '../controllers/telegram.controller.js';
import telegramSecretMiddleware from '../middlewares/telegram-secret.middleware.js';

const router = express.Router();

// Called by Telegram, not by the app: no JWT. Must carry the secret token given in setWebhook.
router.post("/webhook", telegramSecretMiddleware, TelegramController.receiveWebhook);

export default router;
