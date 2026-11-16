import z from 'zod';
import { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import userModel from '../models/user.model.js';
import userService from '../services/user.service.js';
import authSchema from '../schemas/auth.schema.js';

// Unique login or email already taken.
const isUniqueViolation = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const register = async (req: Request, res: Response) => {
    try {
        const parsed = authSchema.register.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { login, password, email, name } = parsed.data;

        await userModel.create({
            login,
            password,
            email,
            name
        });

        return res.sendStatus(201);
    } catch (error) {
        if (isUniqueViolation(error)) return res.status(409).json({ message: "Login ou e-mail já está em uso." });

        console.error("[createUser]: ", error);
        return res.status(500).json({ message: "Failed to create user!" })
    }
}

const login = async (req: Request, res: Response) => {
    try {
        const parsed = authSchema.login.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const { login, password } = parsed.data;

        const result = await userService.login(login, password);

        return res.status(200).json(result);
    } catch (error) {
        console.error("[login(controller)]: ", error);
        return res.status(500).json({ message: "Failed on login!" })
    }
}

// From the database (not the token), so profile and family changes show at once.
const getCurrentUser = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const result = await userService.getMe(req.user.login);

        if (!result) return res.status(401).json({ message: "Authentication failed!" });

        return res.status(200).json(result);
    } catch (error) {
        console.error("[getCurrentUser]: ", error);
        return res.status(500).json({ message: "Failed to get user!" })
    }
}

const updateProfile = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = authSchema.updateProfile.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        await userService.updateProfile(req.user.login, parsed.data);

        return res.sendStatus(200);
    } catch (error) {
        if (isUniqueViolation(error)) return res.status(409).json({ message: "E-mail já está em uso." });

        console.error("[updateProfile]: ", error);
        return res.status(500).json({ message: "Failed to update profile!" })
    }
}

const updateAvatar = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = authSchema.updateAvatar.safeParse(req.body);

        if (!parsed.success) return res.status(400).json({ message: "Foto inválida ou muito grande." });

        await userService.setAvatar(req.user.login, parsed.data.avatar);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[updateAvatar]: ", error);
        return res.status(500).json({ message: "Failed to update photo!" })
    }
}

const removeAvatar = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        await userService.setAvatar(req.user.login, null);

        return res.sendStatus(200);
    } catch (error) {
        console.error("[removeAvatar]: ", error);
        return res.status(500).json({ message: "Failed to remove photo!" })
    }
}

const changePassword = async (req: Request, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const parsed = authSchema.changePassword.safeParse(req.body);

        if (!parsed.success) return res.status(400).json(z.treeifyError(parsed.error).properties);

        const result = await userService.changePassword(req.user.login, parsed.data.currentPassword, parsed.data.newPassword);

        if (result === "WRONG_PASSWORD") return res.status(400).json({ message: "Senha atual incorreta." });
        if (result === "SAME_PASSWORD") return res.status(400).json({ message: "A nova senha deve ser diferente da atual." });

        return res.sendStatus(200);
    } catch (error) {
        console.error("[changePassword]: ", error);
        return res.status(500).json({ message: "Failed to change password!" })
    }
}

export default { login, register, getCurrentUser, updateProfile, updateAvatar, removeAvatar, changePassword };
