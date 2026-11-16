import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const recurrenceSelect = {
    id: true,
    title: true,
    description: true,
    amount: true,
    paymentMethod: true,
    isEssential: true,
    startDate: true,
    totalInstallments: true,
    generatedCount: true,
    canceledAt: true,
    category: true,
    card: { select: { id: true, title: true, lastFourDigits: true, color: true, closingDay: true } },
    createdAt: true
}

// An installment row before it is linked to its recurrence.
export type InstallmentInput = Omit<Prisma.ExpenseCreateManyInput, "recurrenceId">;

// Fields that exist with the same name on Recurrence and Expense, so one object updates both.
export type RecurrenceEditableFields = {
    title?: string
    description?: string
    amount?: string
    categoryId?: string
    isEssential?: boolean
}

const findCategoryInGroup = async (id: string, groupId: string) => {
    return await prisma.category.findFirst({
        where: { id, groupId },
        select: { id: true }
    });
}

const findCardInGroup = async (id: string, groupId: string) => {
    return await prisma.card.findFirst({
        where: { id, groupId },
        select: { id: true, closingDay: true }
    });
}

const getById = async (id: string, groupId: string) => {
    return await prisma.recurrence.findFirst({
        where: { id, groupId }
    });
}

// Series + its installments in one transaction: either all rows exist or none.
const create = async (data: Omit<Prisma.RecurrenceUncheckedCreateInput, "generatedCount">, installments: InstallmentInput[]) => {
    return await prisma.$transaction(async tx => {
        const recurrence = await tx.recurrence.create({
            data: { ...data, generatedCount: installments.length }
        });

        await tx.expense.createMany({
            data: installments.map(installment => ({ ...installment, recurrenceId: recurrence.id }))
        });

        return recurrence;
    });
}

// Used by the top-up of never-ending series.
// The update only matches if generatedCount is still the value the caller read, so two parallel
// calls cannot both append: the second one waits for the row lock, then matches 0 rows and stops.
const appendInstallments = async (recurrenceId: string, expectedGeneratedCount: number, installments: InstallmentInput[]) => {
    return await prisma.$transaction(async tx => {
        const updated = await tx.recurrence.updateMany({
            where: { id: recurrenceId, generatedCount: expectedGeneratedCount, canceledAt: null },
            data: { generatedCount: expectedGeneratedCount + installments.length }
        });

        if (updated.count === 0) return 0;

        const created = await tx.expense.createMany({
            data: installments.map(installment => ({ ...installment, recurrenceId })),
            skipDuplicates: true
        });

        return created.count;
    });
}

const listOpenEndedActive = async (groupId: string) => {
    return await prisma.recurrence.findMany({
        where: { groupId, totalInstallments: null, canceledAt: null },
        // The card's CURRENT closing day is used for new installments.
        include: { card: { select: { closingDay: true } } }
    });
}

// Series of the group + installment stats, with two groupBy queries for all series at once (no N+1).
// "Past" = dueDate <= today, "future" = dueDate > today.
const listByGroup = async (groupId: string, today: Date) => {
    const recurrences = await prisma.recurrence.findMany({
        where: { groupId },
        select: recurrenceSelect,
        orderBy: { createdAt: "desc" }
    });

    const recurrenceIds = recurrences.map(recurrence => recurrence.id);

    const future = await prisma.expense.groupBy({
        by: ["recurrenceId"],
        where: { groupId, recurrenceId: { in: recurrenceIds }, dueDate: { gt: today } },
        _count: { _all: true },
        _sum: { amount: true },
        _min: { dueDate: true }
    });

    const past = await prisma.expense.groupBy({
        by: ["recurrenceId"],
        where: { groupId, recurrenceId: { in: recurrenceIds }, dueDate: { lte: today } },
        _count: { _all: true }
    });

    return { recurrences, future, past };
}

// Updates the series and only its FUTURE installments (dueDate > today). Past rows keep their values.
const updateFuture = async (id: string, groupId: string, today: Date, data: RecurrenceEditableFields) => {
    return await prisma.$transaction(async tx => {
        const updated = await tx.recurrence.updateMany({
            where: { id, groupId, canceledAt: null },
            data
        });

        if (updated.count === 0) return null;

        const installments = await tx.expense.updateMany({
            where: { recurrenceId: id, groupId, dueDate: { gt: today } },
            data
        });

        return { updatedInstallments: installments.count };
    });
}

// Marks the series as canceled and deletes only its FUTURE installments (dueDate > today).
const cancel = async (id: string, groupId: string, today: Date) => {
    return await prisma.$transaction(async tx => {
        const updated = await tx.recurrence.updateMany({
            where: { id, groupId, canceledAt: null },
            data: { canceledAt: new Date() }
        });

        if (updated.count === 0) return null;

        const removed = await tx.expense.deleteMany({
            where: { recurrenceId: id, groupId, dueDate: { gt: today } }
        });

        return { removedInstallments: removed.count };
    });
}

export default { findCategoryInGroup, findCardInGroup, getById, create, appendInstallments, listOpenEndedActive, listByGroup, updateFuture, cancel };
