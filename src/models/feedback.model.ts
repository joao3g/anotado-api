import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, FeedbackType } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

// Reports sent by this user since `since` (for the 5-per-hour limit).
const countByUserSince = async (userId: string, since: Date) => {
    return await prisma.feedback.count({ where: { userId, createdAt: { gte: since } } });
}

const create = async (data: { userId: string, type: FeedbackType, message: string, page?: string, userAgent?: string }) => {
    return await prisma.feedback.create({
        data,
        select: { id: true, createdAt: true }
    });
}

const markEmailed = async (id: string, emailedAt: Date) => {
    await prisma.feedback.update({ where: { id }, data: { emailedAt } });
}

export default { countByUserSince, create, markEmailed };
