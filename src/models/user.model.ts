import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma, GroupRole } from '../generated/prisma/client.js';
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
    role: true,
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

// Returns what the sign-up needs to send the verification email. Never the password hash.
const create = async (data: Prisma.UserCreateInput) => {
    const hash = await bcrypt.hash(data.password, SALT_ROUNDS);

    return await prisma.user.create({
        data: { ...data, password: hash },
        select: { id: true, login: true, name: true, email: true }
    });
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
            emailVerifiedAt: true,
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
            pendingEmail: true,
            role: true,
            group: { select: { id: true, title: true } }
        }
    });
}

// Only name, email, phone and photo. Password and group are changed by their own functions.
const updateProfile = async (id: string, data: { name?: string, email?: string, pendingEmail?: string | null, phone?: string | null, avatar?: string | null }) => {
    return await prisma.user.update({
        where: { id },
        data,
        select: { id: true }
    });
}

// Joins a family only if the user has none (conditional update: safe against two requests at once).
// Joining with an invite code always makes the user a MEMBER.
// Returns false when the user already has a family.
const joinGroup = async (id: string, groupId: string) => {
    const result = await prisma.user.updateMany({
        where: { id, groupId: null },
        data: { groupId, role: "MEMBER" }
    });

    return result.count === 1;
}

// Locks the group row (FOR UPDATE), so membership and role changes of one family run one at a time.
// Without it, two admins removing each other at the same moment could leave the family with no admin.
const lockGroup = async (tx: Prisma.TransactionClient, groupId: string) => {
    await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;
}

// Takes the user out of the family. The role goes back to MEMBER, so nobody keeps ADMIN from an old family.
const removeFromGroupTx = async (tx: Prisma.TransactionClient, id: string) => {
    await tx.user.update({ where: { id }, data: { group: { disconnect: true }, role: "MEMBER" } });
}

// Leaves the family, unless the user is its last member (the family's data would be orphaned)
// or its last admin while other members stay (the family would have nobody to manage it).
const leaveGroup = async (id: string, groupId: string) => {
    return await prisma.$transaction(async (tx) => {
        await lockGroup(tx, groupId);

        const members = await tx.user.count({ where: { groupId } });
        if (members <= 1) return "LAST_MEMBER";

        const me = await tx.user.findFirst({ where: { id, groupId }, select: { role: true } });
        if (!me) throw new Error("User is not in this group!");

        if (me.role === "ADMIN") {
            const admins = await tx.user.count({ where: { groupId, role: "ADMIN" } });
            if (admins <= 1) return "LAST_ADMIN";
        }

        await removeFromGroupTx(tx, id);

        return "OK";
    });
}

// Checks done inside the lock, for an admin acting on another person of the same family:
// "NOT_ADMIN" if the actor is no longer an admin of this family, "SELF" if the target is the actor,
// "NOT_FOUND" if the target does not exist or is in another family (same answer, so nothing leaks).
async function checkAdminAction(tx: Prisma.TransactionClient, actorId: string, targetId: string, groupId: string) {
    const actor = await tx.user.findFirst({ where: { id: actorId, groupId }, select: { role: true } });
    if (actor?.role !== "ADMIN") return "NOT_ADMIN";

    if (targetId === actorId) return "SELF";

    const target = await tx.user.findFirst({ where: { id: targetId, groupId }, select: { id: true } });
    if (!target) return "NOT_FOUND";

    return "OK";
}

// An admin removes another person (admin or member) from the family. Admins leave with leaveGroup instead,
// so the actor always stays and the family keeps at least one admin.
const removeMember = async (actorId: string, targetId: string, groupId: string) => {
    return await prisma.$transaction(async (tx) => {
        await lockGroup(tx, groupId);

        const check = await checkAdminAction(tx, actorId, targetId, groupId);
        if (check !== "OK") return check;

        await removeFromGroupTx(tx, targetId);

        return "OK";
    });
}

// An admin changes the role of another person of the family. The actor cannot change their own role,
// so demoting another admin never leaves the family without an admin.
const setMemberRole = async (actorId: string, targetId: string, groupId: string, role: GroupRole) => {
    return await prisma.$transaction(async (tx) => {
        await lockGroup(tx, groupId);

        const check = await checkAdminAction(tx, actorId, targetId, groupId);
        if (check !== "OK") return check;

        await tx.user.update({ where: { id: targetId }, data: { role } });

        return "OK";
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

// Password reset: accounts with this email, ignoring case (emails are stored as typed).
// Includes the last reset request, for the 2-minute wait between emails.
const listForPasswordReset = async (email: string) => {
    return await prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, login: true, name: true, email: true, passwordResetToken: { select: { createdAt: true } } },
        take: 5
    });
}

// One link per user: a new one replaces the old one (the old link stops working).
const savePasswordResetToken = async (userId: string, tokenHash: string, expiresAt: Date) => {
    await prisma.passwordResetToken.upsert({
        where: { userId },
        create: { userId, tokenHash, expiresAt },
        update: { tokenHash, expiresAt, createdAt: new Date() }
    });
}

// Uses a link once: the token is deleted even when it has expired. Sets the new password in the same transaction.
// Returns false when the link is unknown, already used, or expired.
const resetPasswordWithToken = async (tokenHash: string, newPassword: string, now: Date) => {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    return await prisma.$transaction(async (tx) => {
        const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
        if (!token) return false;

        await tx.passwordResetToken.delete({ where: { userId: token.userId } });
        if (token.expiresAt < now) return false;

        await tx.user.update({ where: { id: token.userId }, data: { password: passwordHash } });
        return true;
    });
}

// Email verification: unconfirmed accounts with this email, ignoring case. Includes the last link's time (2-minute wait).
const listForVerificationResend = async (email: string) => {
    return await prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: null },
        select: { id: true, login: true, name: true, email: true, emailVerificationToken: { select: { createdAt: true } } },
        take: 5
    });
}

// One link per user: a new one replaces the old one.
const saveEmailVerificationToken = async (userId: string, tokenHash: string, expiresAt: Date) => {
    await prisma.emailVerificationToken.upsert({
        where: { userId },
        create: { userId, tokenHash, expiresAt },
        update: { tokenHash, expiresAt, createdAt: new Date() }
    });
}

// Uses a link once (deleted even when expired) and marks the email as confirmed. Returns false for an unknown, used, or expired link.
// Uses a link once (deleted even when expired). Two kinds of link share the table:
// - the user has a pendingEmail (change in Settings > Perfil): it becomes the email -> "EMAIL_CHANGED",
//   unless another account uses it by now -> "EMAIL_TAKEN" (the change is dropped);
// - otherwise it is the sign-up confirmation -> "VERIFIED".
const verifyEmailWithToken = async (tokenHash: string, now: Date) => {
    return await prisma.$transaction(async (tx) => {
        const token = await tx.emailVerificationToken.findUnique({
            where: { tokenHash },
            include: { user: { select: { pendingEmail: true } } }
        });
        if (!token) return "INVALID" as const;

        await tx.emailVerificationToken.delete({ where: { userId: token.userId } });
        if (token.expiresAt < now) return "INVALID" as const;

        const pendingEmail = token.user.pendingEmail;
        if (!pendingEmail) {
            await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
            return "VERIFIED" as const;
        }

        const taken = await tx.user.findFirst({
            where: { email: { equals: pendingEmail, mode: "insensitive" }, NOT: { id: token.userId } },
            select: { id: true }
        });
        if (taken) {
            await tx.user.update({ where: { id: token.userId }, data: { pendingEmail: null } });
            return "EMAIL_TAKEN" as const;
        }

        await tx.user.update({ where: { id: token.userId }, data: { email: pendingEmail, pendingEmail: null, emailVerifiedAt: now } });
        return "EMAIL_CHANGED" as const;
    });
}

// Email change: another account already uses this email (ignoring case)?
const emailUsedByOther = async (email: string, userId: string) => {
    const other = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
        select: { id: true }
    });

    return other !== null;
}

// What the email change needs: current and pending email, and when the last link was sent (2-minute wait).
const getForEmailChange = async (login: string) => {
    return await prisma.user.findUnique({
        where: { login },
        select: { id: true, login: true, name: true, email: true, pendingEmail: true, emailVerificationToken: { select: { createdAt: true } } }
    });
}

// "Cancelar troca": drops the pending email and its link together.
const cancelPendingEmail = async (id: string) => {
    await prisma.$transaction([
        prisma.emailVerificationToken.deleteMany({ where: { userId: id } }),
        prisma.user.update({ where: { id }, data: { pendingEmail: null } })
    ]);
}

export default { create, getById, getByLogin, getByEmail, getForAuthByLogin, getProfileByLogin, updateProfile, joinGroup, leaveGroup, removeMember, setMemberRole, find, update, remove, listForPasswordReset, savePasswordResetToken, resetPasswordWithToken, listForVerificationResend, saveEmailVerificationToken, verifyEmailWithToken, emailUsedByOther, getForEmailChange, cancelPendingEmail };