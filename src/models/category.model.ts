import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const categorySelect = {
    id: true,
    title: true,
    description: true,
    color: true,
    createdAt: true,
    group: {
        select: {
            id: true,
            title: true
        }
    }
}

const create = async (data: Prisma.CategoryCreateInput) => {
    return await prisma.category.create({ data });
}

const getById = async (id: string) => {
    return await prisma.category.findUnique({
        where: { id },
        select: categorySelect
    });
}

const getByIdInGroup = async (id: string, groupId: string) => {
    return await prisma.category.findFirst({
        where: { id, groupId },
        select: categorySelect
    });
}

const getByGroupId = async (groupId: string) => {
    return await prisma.category.findMany({
        where: { groupId },
        select: categorySelect
    });
}

const find = async (skip: number = 0, take: number = 50) => {
    return await prisma.category.findMany({
        skip,
        take,
        select: categorySelect
    });
}

const update = async (id: string, data: Prisma.CategoryUpdateInput) => {
    return await prisma.category.update({
        where: { id },
        data
    });
}

// Counts how many of `ids` belong to the group (used to validate category ids sent by the client).
const countInGroup = async (ids: string[], groupId: string) => {
    return await prisma.category.count({
        where: { id: { in: ids }, groupId }
    });
}

// deleteMany with groupId: deletes nothing if the category belongs to another group. Returns how many were deleted.
const remove = async (id: string, groupId: string) => {
    const result = await prisma.category.deleteMany({
        where: { id, groupId }
    });

    return result.count;
}

export default { create, getById, getByIdInGroup, getByGroupId, countInGroup, find, update, remove };