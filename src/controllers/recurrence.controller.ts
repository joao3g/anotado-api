import z from 'zod';
import { Request, Response } from 'express';
import recurrenceService, { ServiceResult } from '../services/recurrence.service.js';
import recurrenceSchema from '../schemas/recurrence.schema.js';

// Same 404 for "does not exist" and "belongs to another group": we never reveal other groups' ids.
function sendFailure(res: Response, result: Extract<ServiceResult<unknown>, { ok: false }>) {
    if (result.reason === "ALREADY_CANCELED") return res.status(409).json({ message: "Recurrence already canceled!" });
    return res.status(404).json({ message: "Recurrence or category not found!" });
}

const create = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = recurrenceSchema.create.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await recurrenceService.create(req.user.login, parsed.data);
        if (!result.ok) return sendFailure(res, result);

        return res.status(201).json(result.data);
    } catch (error) {
        console.error("[createRecurrence(controller)]: ", error);
        return res.status(500).json({ message: "Failed to create recurrence!" });
    }
}

const list = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const result = await recurrenceService.list(req.user.login);

        return res.status(200).json(result);
    } catch (error) {
        console.error("[listRecurrences(controller)]: ", error);
        return res.status(500).json({ message: "Failed to find recurrences!" });
    }
}

const update = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = recurrenceSchema.update.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await recurrenceService.update(req.user.login, parsed.data);
        if (!result.ok) return sendFailure(res, result);

        return res.status(200).json(result.data);
    } catch (error) {
        console.error("[updateRecurrence(controller)]: ", error);
        return res.status(500).json({ message: "Failed to update recurrence!" });
    }
}

const cancel = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = recurrenceSchema.cancel.safeParse(req.params);
        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await recurrenceService.cancel(req.user.login, parsed.data);
        if (!result.ok) return sendFailure(res, result);

        return res.status(200).json(result.data);
    } catch (error) {
        console.error("[cancelRecurrence(controller)]: ", error);
        return res.status(500).json({ message: "Failed to cancel recurrence!" });
    }
}

export default { create, list, update, cancel };
