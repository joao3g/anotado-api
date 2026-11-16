import z from 'zod';
import { Request, Response } from 'express';
import categoryService from '../services/category.service.js';
import categorySchema from '../schemas/category.schema.js';

const create = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = categorySchema.create.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { title, description, color } = parsed.data;

        await categoryService.create(req.user.login, title, description, color);

        return res.sendStatus(201);
    } catch (error) {
        console.error("[createCategory]: ", error);
        return res.status(500).json({ message: "Failed to create category!" })
    }
}

const list = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const result = await categoryService.getByCurrentGroupId(req.user.login);

        return res.status(200).json(result);
    } catch (error) {
        console.error("[listCategories]: ", error);
        return res.status(500).json({ message: "Failed to find categories!" });
    }
}

const update = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = categorySchema.update.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const updatedItem = await categoryService.update(req.user.login, parsed.data);
        // Same 404 for "does not exist" and "belongs to another group".
        if (!updatedItem) return res.status(404).json({ message: "Category not found!" });

        return res.status(200).json(updatedItem);
    } catch (error) {
        console.error("[updateCategory]: ", error);
        return res.status(500).json({ message: "Failed to update category!" });
    }
}

const remove = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = categorySchema.remove.safeParse(req.params);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const removed = await categoryService.remove(req.user.login, parsed.data);
        // Same 404 for "does not exist" and "belongs to another group".
        if (!removed) return res.status(404).json({ message: "Category not found!" });

        return res.sendStatus(200);
    } catch (error) {
        console.error("[removeCategory]: ", error);
        return res.status(500).json({ message: "Failed to remove category!" })
    }
}

export default { create, list, update, remove };