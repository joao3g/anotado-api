import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const expenseSelect = {
    id: true,
    title: true,
    description: true,
    amount: true,
    transactionDate: true,
    dueDate: true,
    paymentMethod: true,
    category: true,
    card: { select: { id: true, title: true, lastFourDigits: true, color: true, closingDay: true } },
    recurrenceId: true,
    installmentNumber: true,
    recurrence: { select: { totalInstallments: true } }, // For the "3/10" label in the UI
    createdAt: true
}

const create = async (data: Prisma.ExpenseCreateInput) => {
    return await prisma.expense.create({ data });
}

const createMany = async (data: Prisma.ExpenseCreateManyInput[]) => {
    return await prisma.expense.createMany({ data });
}

// Always scoped by group: an id from the client alone is never trusted.
const getByIdInGroup = async (id: string, groupId: string) => {
    return await prisma.expense.findFirst({
        where: { id, groupId }
    });
}

const getByRangeAndTitle = async (startDate: Date, endDate: Date, groupId?: string, title?: string) => {
    return await prisma.expense.findMany({
        where: { title, dueDate: { gte: startDate, lte: endDate }, groupId },
        select: expenseSelect
    });
}

const getByTitle = async (title: string, groupId: string) => {
    return await prisma.expense.findMany({
        where: { title, groupId },
        select: expenseSelect
    });
}

const getSummarizedByRange = async (startDate: Date, endDate: Date, groupId?: string) => {
    const summarizedByTitle = await prisma.expense.groupBy({
        where: {
            groupId,
            dueDate: { gte: startDate, lte: endDate },
        },
        by: ["title"],
        _sum: {
            amount: true
        }
    });

    const summarizedByCategory = await prisma.expense.groupBy({
        where: {
            groupId,
            dueDate: { gte: startDate, lte: endDate },
        },
        by: ["categoryId"],
        _sum: {
            amount: true
        }
    });

    const summarizedByPaymentMethod = await prisma.expense.groupBy({
        where: {
            groupId,
            dueDate: { gte: startDate, lte: endDate },
        },
        by: ["paymentMethod"],
        _sum: {
            amount: true
        }
    });

    return {
        summarizedByTitle,
        summarizedByCategory: await Promise.all(summarizedByCategory.map(async item => {
            // categoryId is null for expenses whose category was deleted. The UI shows them as "Sem categoria".
            if (!item.categoryId) return { ...item, categoryTitle: null, categoryColor: null };

            const categoryItem = await prisma.category.findUnique({ where: { id: item.categoryId } });
            return { ...item, categoryTitle: categoryItem?.title ?? null, categoryColor: categoryItem?.color ?? null };
        })),
        summarizedByPaymentMethod
    }
}

const update = async (id: string, data: Prisma.ExpenseUpdateInput) => {
    return await prisma.expense.update({
        where: { id },
        data
    });
}

const getTotalByRange = async (startDate: Date, endDate: Date, groupId?: string) => {
    return await prisma.expense.aggregate({
        where: { groupId, dueDate: { gte: startDate, lte: endDate } },
        _sum: { amount: true }
    });
}

// deleteMany with groupId: deletes nothing if the expense belongs to another group. Returns how many were deleted.
const remove = async (id: string, groupId: string) => {
    const result = await prisma.expense.deleteMany({
        where: { id, groupId }
    });

    return result.count;
}

// Latest expense of the group with the same title (any case). The WhatsApp bot reuses its category, payment method and card.
const getLatestByTitleInGroup = async (title: string, groupId: string) => {
    return await prisma.expense.findFirst({
        where: { groupId, title: { equals: title, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { categoryId: true, paymentMethod: true, cardId: true }
    });
}

// How many expenses per category since a date (most used categories first in the WhatsApp list).
const countByCategorySince = async (groupId: string, since: Date) => {
    return await prisma.expense.groupBy({
        where: { groupId, createdAt: { gte: since }, categoryId: { not: null } },
        by: ["categoryId"],
        _count: { _all: true }
    });
}

export default { create, createMany, getByRangeAndTitle, getByTitle, getSummarizedByRange, getByIdInGroup, getTotalByRange, update, remove, getLatestByTitleInGroup, countByCategorySince };