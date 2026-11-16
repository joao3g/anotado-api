import z from 'zod';
import { Request, Response } from 'express';
import groupModel from '../models/group.model.js';
import groupSchema from '../schemas/group.schema.js';
import userModel from '../models/user.model.js';

// The user's own group id, or undefined if the user has no group.
async function getOwnGroupId(userLogin: string) {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");

    return userData.group?.id;
}

const create = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.create.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { title, description } = parsed.data;

        await groupModel.create({
            title,
            description,
            users: {
                connect: {
                    login: req.user.login
                }
            }
        });

        return res.sendStatus(201);
    } catch (error) {
        console.error("[createGroup]: ", error);
        return res.status(500).json({ message: "Failed to create group!" })
    }
}

const getByUserLogin = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        if (req.body) {
            const parsed = groupSchema.getByUserLogin.safeParse(req.params);
    
            if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

            const { login } = parsed.data;

            // Another login is only allowed if that user is in the same group.
            if (login && login !== req.user.login) {
                const ownGroupId = await getOwnGroupId(req.user.login);
                const otherUser = await userModel.getByLogin(login);
                if (!ownGroupId || otherUser?.group?.id !== ownGroupId) return res.status(404).json({ message: "Group not found!" });
            }

            const result = await groupModel.getByLogin(login || req.user.login);

            return res.status(200).json(result);
        }

        const result = await groupModel.getByLogin(req.user.login);

        return res.status(200).json(result);
    } catch (error) {
        console.error("[getGroupsByUserLogin]: ", error);
        return res.status(500).json({ message: "Failed to find groups!" })
    }
}

const update = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.update.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { id, title, description } = parsed.data;

        // Only the user's own group. Same 404 for "does not exist" and "another group".
        if (id !== await getOwnGroupId(req.user.login)) return res.status(404).json({ message: "Group not found!" });

        await groupModel.update(id, {
            title,
            description
        });

        return res.sendStatus(200);
    } catch (error) {
        console.error("[updateGroup]: ", error);
        return res.status(500).json({ message: "Failed to update group!" })
    }
}

const remove = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.remove.safeParse(req.params);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { id } = parsed.data;

        // Only the user's own group. Same 404 for "does not exist" and "another group".
        if (id !== await getOwnGroupId(req.user.login)) return res.status(404).json({ message: "Group not found!" });

        await groupModel.remove(id);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[removeGroup]: ", error);
        return res.status(500).json({ message: "Failed to remove group!" })
    }
}

export default { create, getByUserLogin, update, remove };