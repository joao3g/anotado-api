import { randomInt } from 'node:crypto';
import { Prisma, GroupRole } from '../generated/prisma/client.js';
import groupModel from '../models/group.model.js';
import userModel from '../models/user.model.js';

// No 0/O/1/I, so codes are easy to read and type. 32^8 (about 10^12) possible codes.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateInviteCode = () =>
    Array.from({ length: 8 }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join("");

const isUniqueViolation = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// Runs `action` with a new code; on the (very rare) collision with an existing code, tries again.
async function withNewInviteCode<T>(action: (code: string) => Promise<T>) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await action(generateInviteCode());
        } catch (error) {
            if (!isUniqueViolation(error) || attempt >= 5) throw error;
        }
    }
}

async function getUser(login: string) {
    const userData = await userModel.getByLogin(login);
    if (!userData) throw new Error("User not found!");

    return userData;
}

// Own family only. groupMiddleware already guarantees the user has one.
async function getOwnGroupId(login: string) {
    const userData = await getUser(login);
    if (!userData.group?.id) throw new Error("User group not found!");

    return { userId: userData.id, groupId: userData.group.id };
}

const getMine = async (login: string) => {
    const { groupId } = await getOwnGroupId(login);
    const group = await groupModel.getWithMembers(groupId);
    if (!group) throw new Error("Group not found!");

    return {
        title: group.title,
        inviteCode: group.inviteCode,
        members: group.users.map(user => ({
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            isMe: user.login === login
        }))
    };
}

const updateMine = async (login: string, title: string) => {
    const { groupId } = await getOwnGroupId(login);

    await groupModel.update(groupId, { title });
}

// The old code stops working at once.
const regenerateInviteCode = async (login: string) => {
    const { groupId } = await getOwnGroupId(login);

    return await withNewInviteCode(async (inviteCode) => {
        await groupModel.update(groupId, { inviteCode });
        return inviteCode;
    });
}

// "LAST_MEMBER" when the user is the only member (the family's data would have nobody left).
// "LAST_ADMIN" when the user is the only admin and other members stay.
const leave = async (login: string) => {
    const { userId, groupId } = await getOwnGroupId(login);

    return await userModel.leaveGroup(userId, groupId);
}

// Admin only. "NOT_ADMIN", "SELF" or "NOT_FOUND" instead of throwing, so the controller can answer 403/400/404.
const removeMember = async (login: string, memberId: string) => {
    const { userId, groupId } = await getOwnGroupId(login);

    return await userModel.removeMember(userId, memberId, groupId);
}

const setMemberRole = async (login: string, memberId: string, role: GroupRole) => {
    const { userId, groupId } = await getOwnGroupId(login);

    return await userModel.setMemberRole(userId, memberId, groupId, role);
}

// "INVALID_CODE" or "ALREADY_IN_GROUP" instead of throwing, so the controller can answer 404/409.
const join = async (login: string, code: string) => {
    const userData = await getUser(login);
    if (userData.group?.id) return "ALREADY_IN_GROUP";

    const group = await groupModel.getByInviteCode(code);
    if (!group) return "INVALID_CODE";

    return await userModel.joinGroup(userData.id, group.id) ? "OK" : "ALREADY_IN_GROUP";
}

// "ALREADY_IN_GROUP" when the user already has a family (they must leave it first).
const create = async (login: string, title: string) => {
    const userData = await getUser(login);
    if (userData.group?.id) return "ALREADY_IN_GROUP";

    const group = await withNewInviteCode((inviteCode) => groupModel.createForUser(userData.id, title, inviteCode));

    return group ? "OK" : "ALREADY_IN_GROUP";
}

export default { getMine, updateMine, regenerateInviteCode, leave, removeMember, setMemberRole, join, create };
