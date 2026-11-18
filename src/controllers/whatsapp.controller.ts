import { Request, Response } from 'express';
import whatsappService from '../services/whatsapp.service.js';
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
    const messages = whatsappService.extractMessages(req.body);
    res.sendStatus(200);

    void (async () => {
        for (const message of messages) {
            try {
                await whatsappService.handleIncoming(message);
            } catch (error) {
                console.error("[whatsappWebhook]: ", error instanceof Error ? error.message : "unknown error");
            }
        }
    })();
}

const getStatus = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        return res.status(200).json(await whatsappService.getStatus(req.user.login));
    } catch (error) {
        console.error("[whatsappStatus]: ", error);
        return res.status(500).json({ message: "Failed to get WhatsApp status!" });
    }
}

const createLinkCode = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });
        if (!isWhatsappEnabled()) return res.status(503).json({ message: "O WhatsApp ainda não está disponível." });

        return res.status(200).json(await whatsappService.createLinkCode(req.user.login));
    } catch (error) {
        console.error("[whatsappLinkCode]: ", error);
        return res.status(500).json({ message: "Failed to create WhatsApp code!" });
    }
}

const unlink = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        await whatsappService.unlinkByLogin(req.user.login);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[whatsappUnlink]: ", error);
        return res.status(500).json({ message: "Failed to disconnect WhatsApp!" });
    }
}

export default { verifyWebhook, receiveWebhook, getStatus, createLinkCode, unlink };
