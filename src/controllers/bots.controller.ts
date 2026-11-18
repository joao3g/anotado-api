import { Request, Response } from 'express';
import linkService from '../services/chatbot/link.service.js';
import { isWhatsappEnabled } from '../utils/whatsapp-config.js';
import { isTelegramEnabled } from '../utils/telegram-config.js';

const getStatus = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        return res.status(200).json(await linkService.getStatus(req.user.login));
    } catch (error) {
        console.error("[botsStatus]: ", error);
        return res.status(500).json({ message: "Failed to get bots status!" });
    }
}

const createLinkCode = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });
        if (!isWhatsappEnabled() && !isTelegramEnabled()) return res.status(503).json({ message: "Os bots de mensagem ainda não estão disponíveis." });

        return res.status(200).json(await linkService.createLinkCode(req.user.login));
    } catch (error) {
        console.error("[botsLinkCode]: ", error);
        return res.status(500).json({ message: "Failed to create bot code!" });
    }
}

const unlink = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const channel = req.params["channel"];
        if (channel !== "whatsapp" && channel !== "telegram") return res.status(404).json({ message: "Bot não encontrado." });

        await linkService.unlink(req.user.login, channel);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[botsUnlink]: ", error);
        return res.status(500).json({ message: "Failed to disconnect bot!" });
    }
}

export default { getStatus, createLinkCode, unlink };
