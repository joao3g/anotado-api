import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const incomeSelect = {
    id: true,
    title: true,
    date: true,
    amount: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true,
        }
    },
    group: {
        select: {
            id: true,
            title: true
        }
    },
    createdAt: true
}

const create = async (data: Prisma.IncomeCreateInput) => {
    const firstDayOfMonthDate = new Date(data.date);
    firstDayOfMonthDate.setUTCDate(1);

    data.date = firstDayOfMonthDate;

    return await prisma.income.create({ data });
}

// Always scoped by group: an id from the client alone is never trusted.
const getByIdInGroup = async (id: string, groupId: string) => {
    return await prisma.income.findFirst({
        where: { id, groupId },
        select: incomeSelect
    });
}

// groupId required: a user id from another group returns an empty list.
const getByUser = async (userId: string, groupId: string) => {
    return await prisma.income.findMany({
        where: { userId, groupId },
        select: incomeSelect
    });
}

const getByGroup = async (groupId: string) => {
    return await prisma.income.findMany({
        where: { groupId },
        select: incomeSelect
    });
}

const getByDate = async (date: Date, groupId: string) => {
    const firstDayOfMonthDate = new Date(date);
    firstDayOfMonthDate.setUTCDate(1);

    return await prisma.income.findMany({
        where: { date: { equals: firstDayOfMonthDate }, groupId },
        select: incomeSelect
    });
}

const getTotalByRange = async (startDate: Date, endDate: Date, groupId: string) => {
    return await prisma.income.aggregate({
        where: { groupId, date: { gte: startDate, lte: endDate } },
        _sum: { amount: true }
    });
}

const update = async (id: string, data: Prisma.IncomeUpdateInput) => {
    if (data.date && (typeof data.date === 'string' || data.date instanceof Date)) {
        const firstDayOfMonthDate = new Date(data.date);
        firstDayOfMonthDate.setUTCDate(1);

        data.date = firstDayOfMonthDate;
    }

    return await prisma.income.update({
        where: { id },
        data
    });
}

// deleteMany with groupId: deletes nothing if the income belongs to another group. Returns how many were deleted.
const remove = async (id: string, groupId: string) => {
    const result = await prisma.income.deleteMany({
        where: { id, groupId }
    });

    return result.count;
}

export default { create, getByIdInGroup, getByGroup, getByUser, getByDate, getTotalByRange, update, remove };