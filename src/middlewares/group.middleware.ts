import { NextFunction, Request, Response } from 'express';
import userModel from '../models/user.model.js';

// Family data routes (categories, expenses, incomes, recurrences, cards, /group/me).
// Runs after authMiddleware. A user without a family gets 403 NO_GROUP, so no query
// ever runs with groupId undefined (Prisma ignores undefined filters and would match every group).
export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const userData = await userModel.getByLogin(req.user.login);

        if (!userData) return res.status(401).json({ message: "Authentication failed!" });
        if (!userData.group?.id) return res.status(403).json({ code: "NO_GROUP", message: "User has no family!" });

        next();
    } catch (error) {
        console.error("[groupMiddleware]: ", error);
        return res.status(500).json({ message: "Failed to check the user's family!" });
    }
}
