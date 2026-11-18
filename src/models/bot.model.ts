import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, PaymentMethod } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

export type BotChannelName = "whatsapp" | "telegram";

// The User column that holds each channel's id.
const idField = (channel: BotChannelName) => channel === "whatsapp" ? "whatsappId" : "telegramId";

const botUserSelect = { id: true, login: true, name: true, groupId: true };

// Stores a received update id ("wa:..." / "tg:..."). Returns false when it was already received (platform retry).
const recordInboundMessage = async (id: string, senderId: string) => {
    try {
        await prisma.botInboundMessage.create({ data: { id, senderId } });
        return true;
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
        throw error;
    }
}

const countMessagesSince = async (senderId: string, since: Date) => {
    return await prisma.botInboundMessage.count({ where: { senderId, createdAt: { gte: since } } });
}

const deleteMessagesBefore = async (before: Date) => {
    await prisma.botInboundMessage.deleteMany({ where: { createdAt: { lt: before } } });
}

// The user linked to a channel id, with what the bot needs. Never the password.
const getUserByChannelId = async (channel: BotChannelName, externalId: string) => {
    return channel === "whatsapp"
        ? await prisma.user.findUnique({ where: { whatsappId: externalId }, select: botUserSelect })
        : await prisma.user.findUnique({ where: { telegramId: externalId }, select: botUserSelect });
}

const getLinks = async (userId: string) => {
    return await prisma.user.findUnique({ where: { id: userId }, select: { whatsappId: true, telegramId: true } });
}

// One code per user: a new code replaces the old one. The same code works with any bot.
const saveLinkCode = async (userId: string, codeHash: string, expiresAt: Date) => {
    await prisma.botLinkCode.upsert({
        where: { userId },
        create: { userId, codeHash, expiresAt },
        update: { codeHash, expiresAt }
    });
}

// Uses a valid code once and links the channel id to its user. If another user had this channel id,
// it is unlinked from them (whoever sends the code controls that account). Returns the user, or null.
const linkWithCode = async (codeHash: string, channel: BotChannelName, externalId: string, now: Date) => {
    const field = idField(channel);

    return await prisma.$transaction(async (tx) => {
        const code = await tx.botLinkCode.findUnique({ where: { codeHash } });
        if (!code) return null;

        await tx.botLinkCode.delete({ where: { userId: code.userId } });
        if (code.expiresAt < now) return null;

        await tx.user.updateMany({ where: { [field]: externalId, NOT: { id: code.userId } }, data: { [field]: null } });
        await tx.botDraft.deleteMany({ where: { userId: code.userId } });

        return await tx.user.update({
            where: { id: code.userId },
            data: { [field]: externalId },
            select: botUserSelect
        });
    });
}

const unlink = async (userId: string, channel: BotChannelName) => {
    await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { [idField(channel)]: null } }),
        prisma.botDraft.deleteMany({ where: { userId } })
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
        await tx.botDraft.deleteMany({ where: { userId } });
        return await tx.botDraft.create({ data: { ...data, userId } });
    });
}

const getDraft = async (userId: string) => {
    return await prisma.botDraft.findUnique({ where: { userId } });
}

const updateDraft = async (id: string, userId: string, data: { paymentMethod?: PaymentMethod, cardId?: string | null, categoryId?: string, expiresAt: Date }) => {
    const result = await prisma.botDraft.updateMany({ where: { id, userId }, data });
    return result.count === 1;
}

// Deletes the draft only if it is still this one. Returns false when it was already used or replaced,
// so a double tap on "Salvar" (two webhook calls) can never create two expenses.
const takeDraft = async (id: string, userId: string) => {
    const result = await prisma.botDraft.deleteMany({ where: { id, userId } });
    return result.count === 1;
}

const deleteDraft = async (userId: string) => {
    await prisma.botDraft.deleteMany({ where: { userId } });
}

export default {
    recordInboundMessage, countMessagesSince, deleteMessagesBefore,
    getUserByChannelId, getLinks, saveLinkCode, linkWithCode, unlink,
    replaceDraft, getDraft, updateDraft, takeDraft, deleteDraft
};
