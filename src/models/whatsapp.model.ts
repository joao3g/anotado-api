import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, PaymentMethod } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

// Stores a received message id. Returns false when it was already received (Meta retries webhooks).
const recordInboundMessage = async (id: string, waId: string) => {
    try {
        await prisma.whatsappMessage.create({ data: { id, waId } });
        return true;
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
        throw error;
    }
}

const countMessagesSince = async (waId: string, since: Date) => {
    return await prisma.whatsappMessage.count({ where: { waId, createdAt: { gte: since } } });
}

const deleteMessagesBefore = async (before: Date) => {
    await prisma.whatsappMessage.deleteMany({ where: { createdAt: { lt: before } } });
}

// The user linked to a WhatsApp id, with what the bot needs. Never the password.
const getUserByWaId = async (whatsappId: string) => {
    return await prisma.user.findUnique({
        where: { whatsappId },
        select: { id: true, login: true, name: true, groupId: true }
    });
}

const getWaIdByUserId = async (id: string) => {
    const user = await prisma.user.findUnique({ where: { id }, select: { whatsappId: true } });
    return user?.whatsappId ?? null;
}

// One code per user: a new code replaces the old one.
const saveLinkCode = async (userId: string, codeHash: string, expiresAt: Date) => {
    await prisma.whatsappLinkCode.upsert({
        where: { userId },
        create: { userId, codeHash, expiresAt },
        update: { codeHash, expiresAt }
    });
}

// Uses a valid code once and links the WhatsApp id to its user. If another user had this WhatsApp id,
// it is unlinked from them (whoever sends the code controls the number). Returns the user, or null.
const linkWithCode = async (codeHash: string, whatsappId: string, now: Date) => {
    return await prisma.$transaction(async (tx) => {
        const code = await tx.whatsappLinkCode.findUnique({ where: { codeHash } });
        if (!code) return null;

        await tx.whatsappLinkCode.delete({ where: { userId: code.userId } });
        if (code.expiresAt < now) return null;

        await tx.user.updateMany({ where: { whatsappId, NOT: { id: code.userId } }, data: { whatsappId: null } });
        await tx.whatsappDraft.deleteMany({ where: { userId: code.userId } });

        return await tx.user.update({
            where: { id: code.userId },
            data: { whatsappId },
            select: { id: true, login: true, name: true, groupId: true }
        });
    });
}

const unlink = async (userId: string) => {
    await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { whatsappId: null } }),
        prisma.whatsappDraft.deleteMany({ where: { userId } }),
        prisma.whatsappLinkCode.deleteMany({ where: { userId } })
    ]);
}

type DraftData = {
    title: string,
    amount: string,
    date: Date,
    paymentMethod: PaymentMethod | null,
    cardId: string | null,
    categoryId: string | null,
    expiresAt: Date
};

// A new expense message replaces the previous draft (new id, so old buttons stop working).
const replaceDraft = async (userId: string, data: DraftData) => {
    return await prisma.$transaction(async (tx) => {
        await tx.whatsappDraft.deleteMany({ where: { userId } });
        return await tx.whatsappDraft.create({ data: { ...data, userId } });
    });
}

const getDraft = async (userId: string) => {
    return await prisma.whatsappDraft.findUnique({ where: { userId } });
}

const updateDraft = async (id: string, userId: string, data: { paymentMethod?: PaymentMethod, cardId?: string | null, categoryId?: string, expiresAt: Date }) => {
    const result = await prisma.whatsappDraft.updateMany({ where: { id, userId }, data });
    return result.count === 1;
}

// Deletes the draft only if it is still this one. Returns false when it was already used or replaced,
// so a double tap on "Salvar" (two webhook calls) can never create two expenses.
const takeDraft = async (id: string, userId: string) => {
    const result = await prisma.whatsappDraft.deleteMany({ where: { id, userId } });
    return result.count === 1;
}

const deleteDraft = async (userId: string) => {
    await prisma.whatsappDraft.deleteMany({ where: { userId } });
}

export default {
    recordInboundMessage, countMessagesSince, deleteMessagesBefore,
    getUserByWaId, getWaIdByUserId, saveLinkCode, linkWithCode, unlink,
    replaceDraft, getDraft, updateDraft, takeDraft, deleteDraft
};
