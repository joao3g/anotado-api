import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const groupSelect = {
    title: true,
    description: true,
    createdAt: true
}

const create = async (data: Prisma.GroupCreateInput) => {
    return await prisma.group.create({ data });
}

const getById = async (id: string) => {
    return await prisma.group.findUnique({
        where: { id },
        select: groupSelect
    });
}

const getByLogin = async (login: string) => {
    return await prisma.group.findFirst({
        where: { users: { some: { login } } },
        select: groupSelect
    });
}

const countUsersByGroup = async (id: string) => {
    return await prisma.user.count({
        where: { groupId: id }
    });
}

const getByInviteCode = async (inviteCode: string) => {
    return await prisma.group.findUnique({
        where: { inviteCode },
        select: { id: true }
    });
}

// Family page: the group and its members. Never the members' login, password or phone.
const getWithMembers = async (id: string) => {
    return await prisma.group.findUnique({
        where: { id },
        select: {
            title: true,
            inviteCode: true,
            users: {
                select: { login: true, name: true, email: true, avatar: true },
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

// Creates a family and puts the user in it, only if the user has no family yet.
// Returns null (and creates nothing) when the user already has one.
const createForUser = async (userId: string, title: string, inviteCode: string) => {
    return await prisma.$transaction(async (tx) => {
        const group = await tx.group.create({ data: { title, inviteCode }, select: { id: true } });

        const joined = await tx.user.updateMany({ where: { id: userId, groupId: null }, data: { groupId: group.id } });

        // Throwing rolls the transaction back, so the empty group is not kept.
        if (joined.count !== 1) throw new Error("USER_ALREADY_IN_GROUP");

        return group;
    }).catch((error) => {
        if (error instanceof Error && error.message === "USER_ALREADY_IN_GROUP") return null;
        throw error;
    });
}

const find = async (skip: number = 0, take: number = 50) => {
    return await prisma.group.findMany({
        skip,
        take,
        select: groupSelect
    });
}

const update = async (id: string, data: Prisma.GroupUpdateInput) => {
    return await prisma.group.update({
        where: { id },
        data
    });
}

const remove = async (id: string) => {
    return await prisma.group.delete({
        where: { id }
    });
}

export default { create, getById, getByLogin, getByInviteCode, getWithMembers, createForUser, countUsersByGroup, find, update, remove };