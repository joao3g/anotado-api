import { NextFunction, Request, Response } from 'express';
import userModel from '../models/user.model.js';

// Family routes only an admin may use (rename the family, new invite code, manage members).
// Runs after authMiddleware and groupMiddleware. The role is read from the database, never from the token,
// so a promotion or demotion counts on the very next request.
export default async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) return res.status(401).json({ message: "Authentication failed!" });

        const userData = await userModel.getByLogin(req.user.login);

        if (!userData) return res.status(401).json({ message: "Authentication failed!" });
        if (userData.role !== "ADMIN") return res.status(403).json({ code: "NOT_ADMIN", message: "Apenas administradores podem fazer isso." });

        next();
    } catch (error) {
        console.error("[adminMiddleware]: ", error);
        return res.status(500).json({ message: "Failed to check the user's role!" });
    }
}
