import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { calculateNextInvoiceDate } from '../utils/date.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const cardSelect = {
    id: true,
    title: true,
    lastFourDigits: true,
    color: true,
    closingDay: true,
    dueDay: true,
    createdAt: true
}

const create = async (data: Prisma.CardUncheckedCreateInput) => {
    return await prisma.card.create({ data, select: cardSelect });
}

const listByGroup = async (groupId: string) => {
    return await prisma.card.findMany({
        where: { groupId },
        select: cardSelect,
        orderBy: { createdAt: "asc" }
    });
}

// Always scoped by group: an id from the client alone is never trusted.
const getByIdInGroup = async (id: string, groupId: string) => {
    return await prisma.card.findFirst({
        where: { id, groupId },
        select: cardSelect
    });
}

// Cards of the group among `ids` (used to validate card ids sent by the client and to read their closing days).
const listByIdsInGroup = async (ids: string[], groupId: string) => {
    return await prisma.card.findMany({
        where: { id: { in: ids }, groupId },
        select: cardSelect
    });
}

// How many expenses and recurrences use the card. A card in use cannot be deleted.
const countUsage = async (id: string, groupId: string) => {
    const [expenses, recurrences] = await Promise.all([
        prisma.expense.count({ where: { cardId: id, groupId } }),
        prisma.recurrence.count({ where: { cardId: id, groupId } })
    ]);

    return expenses + recurrences;
}

// Updates the card. When the closing or due day changes (`newDays`), recalculates dueDate of the card's expenses
// with dueDate > today (open invoices and future installments). Past rows never change.
// All in one transaction: the card and its expenses never disagree.
const updateAndRecalculate = async (id: string, groupId: string, data: Prisma.CardUpdateInput, newDays: { closingDay: number, dueDay: number } | null, today: Date) => {
    return await prisma.$transaction(async tx => {
        const card = await tx.card.update({ where: { id, groupId }, data, select: cardSelect });

        if (newDays === null) return { card, recalculatedExpenses: 0 };

        const futureExpenses = await tx.expense.findMany({
            where: { cardId: id, groupId, dueDate: { gt: today } },
            select: { id: true, transactionDate: true, dueDate: true }
        });

        // Group ids by their new dueDate: one updateMany per distinct date instead of one query per row.
        const idsByNewDueDate = new Map<number, string[]>();
        for (const expense of futureExpenses) {
            const newDueDate = calculateNextInvoiceDate(expense.transactionDate, newDays);
            if (newDueDate.getTime() === expense.dueDate.getTime()) continue;

            const ids = idsByNewDueDate.get(newDueDate.getTime()) ?? [];
            ids.push(expense.id);
            idsByNewDueDate.set(newDueDate.getTime(), ids);
        }

        let recalculatedExpenses = 0;
        for (const [time, ids] of idsByNewDueDate) {
            const result = await tx.expense.updateMany({
                where: { id: { in: ids }, groupId },
                data: { dueDate: new Date(time) }
            });
            recalculatedExpenses += result.count;
        }

        return { card, recalculatedExpenses };
    });
}

// deleteMany with groupId: deletes nothing if the card belongs to another group. Returns how many were deleted.
const remove = async (id: string, groupId: string) => {
    const result = await prisma.card.deleteMany({
        where: { id, groupId }
    });

    return result.count;
}

export default { create, listByGroup, getByIdInGroup, listByIdsInGroup, countUsage, updateAndRecalculate, remove };
