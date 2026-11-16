import z from 'zod';
import { Request, Response } from 'express';
import cardService, { CardResult } from '../services/card.service.js';
import cardSchema from '../schemas/card.schema.js';
import { Prisma } from '../generated/prisma/client.js';

// Same 404 for "does not exist" and "belongs to another group": we never reveal other groups' ids.
function sendFailure(res: Response, result: Extract<CardResult<unknown>, { ok: false }>) {
    if (result.reason === "IN_USE") return res.status(409).json({ message: "Card has expenses or recurrences!" });
    return res.status(404).json({ message: "Card not found!" });
}

const create = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = cardSchema.create.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const created = await cardService.create(req.user.login, parsed.data);

        return res.status(201).json(created);
    } catch (error) {
        console.error("[createCard(controller)]: ", error);
        return res.status(500).json({ message: "Failed to create card!" });
    }
}

const list = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const result = await cardService.list(req.user.login);

        return res.status(200).json(result);
    } catch (error) {
        console.error("[listCards(controller)]: ", error);
        return res.status(500).json({ message: "Failed to find cards!" });
    }
}

const update = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = cardSchema.update.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await cardService.update(req.user.login, parsed.data);
        if (!result.ok) return sendFailure(res, result);

        return res.status(200).json(result.data);
    } catch (error) {
        console.error("[updateCard(controller)]: ", error);
        return res.status(500).json({ message: "Failed to update card!" });
    }
}

const remove = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = cardSchema.remove.safeParse(req.params);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await cardService.remove(req.user.login, parsed.data);
        if (!result.ok) return sendFailure(res, result);

        return res.sendStatus(200);
    } catch (error) {
        // An expense was linked between the usage check and the delete: the database blocks it (ON DELETE RESTRICT).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
            return res.status(409).json({ message: "Card has expenses or recurrences!" });
        }

        console.error("[removeCard(controller)]: ", error);
        return res.status(500).json({ message: "Failed to remove card!" });
    }
}

export default { create, list, update, remove };
