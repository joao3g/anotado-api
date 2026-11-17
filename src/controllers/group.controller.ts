import z from 'zod';
import { Request, Response } from 'express';
import groupModel from '../models/group.model.js';
import groupSchema from '../schemas/group.schema.js';
import userModel from '../models/user.model.js';
import groupService from '../services/group.service.js';

// The user's own group id, or undefined if the user has no group.
async function getOwnGroupId(userLogin: string) {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");

    return userData.group?.id;
}

// New family for a user who has none (onboarding). 409 if the user already has a family.
const create = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.create.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await groupService.create(req.user.login, parsed.data.title);

        if (result === "ALREADY_IN_GROUP") return res.status(409).json({ message: "Você já faz parte de uma família." });

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

const getMine = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        return res.status(200).json(await groupService.getMine(req.user.login));
    } catch (error) {
        console.error("[getMyGroup]: ", error);
        return res.status(500).json({ message: "Failed to get family!" })
    }
}

const updateMine = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.updateMine.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        await groupService.updateMine(req.user.login, parsed.data.title);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[updateMyGroup]: ", error);
        return res.status(500).json({ message: "Failed to update family!" })
    }
}

const regenerateInviteCode = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const inviteCode = await groupService.regenerateInviteCode(req.user.login);

        return res.status(200).json({ inviteCode });
    } catch (error) {
        console.error("[regenerateInviteCode]: ", error);
        return res.status(500).json({ message: "Failed to create a new invite code!" })
    }
}

const leave = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const result = await groupService.leave(req.user.login);

        if (result === "LAST_MEMBER") return res.status(409).json({ message: "Você é o último membro da família e não pode sair." });
        if (result === "LAST_ADMIN") return res.status(409).json({ message: "Você é o único admin. Torne outro membro admin antes de sair." });

        return res.sendStatus(200);
    } catch (error) {
        console.error("[leaveGroup]: ", error);
        return res.status(500).json({ message: "Failed to leave family!" })
    }
}

// Shared answers for the admin actions on a member.
function sendMemberActionError(res: Response, result: "NOT_ADMIN" | "SELF" | "NOT_FOUND") {
    if (result === "NOT_ADMIN") return res.status(403).json({ code: "NOT_ADMIN", message: "Apenas administradores podem fazer isso." });
    if (result === "SELF") return res.status(400).json({ message: "Você não pode fazer isso com você mesmo." });
    return res.status(404).json({ message: "Membro não encontrado." });
}

// Admin only: removes another person (admin or member) from the family.
const removeMember = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.memberParams.safeParse(req.params);

        // Same 404 as a member of another family.
        if (!parsed.success) return res.status(404).json({ message: "Membro não encontrado." });

        const result = await groupService.removeMember(req.user.login, parsed.data.id);

        if (result !== "OK") return sendMemberActionError(res, result);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[removeMember]: ", error);
        return res.status(500).json({ message: "Failed to remove member!" })
    }
}

// Admin only: makes another person an admin, or an admin back a member.
const setMemberRole = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const params = groupSchema.memberParams.safeParse(req.params);

        if (!params.success) return res.status(404).json({ message: "Membro não encontrado." });

        const parsed = groupSchema.setMemberRole.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await groupService.setMemberRole(req.user.login, params.data.id, parsed.data.role);

        if (result !== "OK") return sendMemberActionError(res, result);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[setMemberRole]: ", error);
        return res.status(500).json({ message: "Failed to change member role!" })
    }
}

const join = async (req: Request, res: Response) => {
    try {
        if(!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = groupSchema.join.safeParse(req.body);

        if (!parsed.success) return res.status(404).json({ message: "Código inválido." });

        const result = await groupService.join(req.user.login, parsed.data.code);

        if (result === "INVALID_CODE") return res.status(404).json({ message: "Código inválido." });
        if (result === "ALREADY_IN_GROUP") return res.status(409).json({ message: "Você já faz parte de uma família." });

        return res.sendStatus(200);
    } catch (error) {
        console.error("[joinGroup]: ", error);
        return res.status(500).json({ message: "Failed to join family!" })
    }
}

export default { create, getByUserLogin, getMine, updateMine, regenerateInviteCode, leave, removeMember, setMemberRole, join };