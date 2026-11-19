import z from 'zod';
import { Request, Response } from 'express';
import feedbackService from '../services/feedback.service.js';
import feedbackSchema from '../schemas/feedback.schema.js';

// "Reportar problema". Logged-in users only; no family needed. The message is never logged.
const create = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = feedbackSchema.create.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await feedbackService.create(req.user.login, parsed.data);

        if (result.status === "TOO_MANY") return res.status(429).json({ message: "Muitas mensagens em pouco tempo. Tente de novo mais tarde." });

        res.status(201).json({ id: result.id });

        // After the response: a slow or failing email never loses the report (it is already saved).
        feedbackService.sendEmail(result.id, result.createdAt, parsed.data, result.user)
            .catch(error => console.error("[feedback]: ", error));
    } catch (error) {
        console.error("[createFeedback]: ", error);
        return res.status(500).json({ message: "Failed to send feedback!" });
    }
}

export default { create };
