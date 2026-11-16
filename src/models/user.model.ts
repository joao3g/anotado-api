import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = Number(process.env["SALT_ROUNDS"]);

if (!SALT_ROUNDS || Number.isNaN(SALT_ROUNDS)) throw new Error("Invalid SALT_ROUNDS!");

const userSelect = {
    id: true,
    email: true,
    login: true,
    name: true,
    group: {
        select: {
            id: true,
            title: true,
            description: true,
            createdAt: true
        }
    },
    createdAt: true
}

const create = async (data: Prisma.UserCreateInput) => {
    const hash = await bcrypt.hash(data.password, SALT_ROUNDS);
    await prisma.user.create({ data: { ...data, password: hash } });

    return;
}

const getById = async (id: string) => {
    return await prisma.user.findUnique({
        where: { id },
        select: userSelect
    });
}

const getByEmail = async (email: string) => {
    return await prisma.user.findUnique({
        where: { email },
        select: userSelect
    });
}

const getByLogin = async (login: string) => {
    return await prisma.user.findUnique({
        where: { login },
        select: userSelect
    });
}

const getForAuthByLogin = async (login: string) => {
    return await prisma.user.findUnique({
        where: { login },
        select: {
            id: true,
            login: true,
            name: true,
            email: true,
            password: true,
            group: true
        }
    });
}

// Profile for /auth/me and login. Separate from userSelect so the photo (~50 KB) is not loaded on every request.
const getProfileByLogin = async (login: string) => {
    return await prisma.user.findUnique({
        where: { login },
        select: {
            id: true,
            login: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            group: { select: { id: true, title: true } }
        }
    });
}

// Only name, email, phone and photo. Password and group are changed by their own functions.
const updateProfile = async (id: string, data: { name?: string, email?: string, phone?: string | null, avatar?: string | null }) => {
    return await prisma.user.update({
        where: { id },
        data,
        select: { id: true }
    });
}

// Joins a family only if the user has none (conditional update: safe against two requests at once).
// Returns false when the user already has a family.
const joinGroup = async (id: string, groupId: string) => {
    const result = await prisma.user.updateMany({
        where: { id, groupId: null },
        data: { groupId }
    });

    return result.count === 1;
}

// Leaves the family, unless the user is its last member (the family's data would be orphaned).
// The group row is locked (FOR UPDATE) so two members cannot both leave at the same time.
// Returns false when the user is the last member.
const leaveGroup = async (id: string, groupId: string) => {
    return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;

        const members = await tx.user.count({ where: { groupId } });
        if (members <= 1) return false;

        await tx.user.update({ where: { id }, data: { group: { disconnect: true } } });

        return true;
    });
}

const find = async (skip: number = 0, take: number = 50) => {
    return await prisma.user.findMany({
        skip,
        take,
        select: userSelect
    });
}

const update = async (id: string, data: Prisma.UserUpdateInput) => {
    const updateData = { ...data };

    if (typeof data.password === "string") updateData.password = await bcrypt.hash(data.password, SALT_ROUNDS);
    else if (data.password && typeof data.password === "object" && 'set' in data.password && typeof data.password.set === "string") {
        updateData.password = await bcrypt.hash(data.password.set, SALT_ROUNDS);
    }

    return await prisma.user.update({
        where: { id },
        data: updateData
    });
}

const remove = async (id: string) => {
    return await prisma.user.delete({
        where: { id }
    });
}

export default { create, getById, getByLogin, getByEmail, getForAuthByLogin, getProfileByLogin, updateProfile, joinGroup, leaveGroup, find, update, remove };