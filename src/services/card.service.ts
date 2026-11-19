import 'dotenv/config';
import z from 'zod';
import userModel from '../models/user.model.js';
import cardModel from '../models/card.model.js';
import cardSchema from '../schemas/card.schema.js';
import { todayInBrazil } from '../utils/date.js';

export type CardResult<T> = { ok: true, data: T } | { ok: false, reason: "NOT_FOUND" | "IN_USE" };

async function getGroupId(userLogin: string) {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    return userData.group.id;
}

const create = async (userLogin: string, data: z.infer<typeof cardSchema.create>) => {
    try {
        const groupId = await getGroupId(userLogin);

        return await cardModel.create({
            title: data.title,
            lastFourDigits: data.lastFourDigits ?? null,
            color: data.color.toUpperCase(),
            closingDay: data.closingDay,
            dueDay: data.dueDay,
            groupId
        });
    } catch (error) {
        console.error("[createCard(service)]: ", error);
        throw error;
    }
}

const list = async (userLogin: string) => {
    try {
        return await cardModel.listByGroup(await getGroupId(userLogin));
    } catch (error) {
        console.error("[listCards(service)]: ", error);
        throw error;
    }
}

const update = async (userLogin: string, data: z.infer<typeof cardSchema.update>): Promise<CardResult<{ recalculatedExpenses: number }>> => {
    const groupId = await getGroupId(userLogin);

    const currentCard = await cardModel.getByIdInGroup(data.id, groupId);
    if (!currentCard) return { ok: false, reason: "NOT_FOUND" };

    // Only recalculate dates when the closing or due day really changes. A day not sent keeps its current value.
    const closingDay = data.closingDay ?? currentCard.closingDay;
    const dueDay = data.dueDay ?? currentCard.dueDay;
    const daysChanged = closingDay !== currentCard.closingDay || dueDay !== currentCard.dueDay;

    // Undefined keys are ignored by Prisma: only the fields sent change. "" clears lastFourDigits.
    const result = await cardModel.updateAndRecalculate(currentCard.id, groupId, {
        title: data.title,
        lastFourDigits: data.lastFourDigits === "" ? null : data.lastFourDigits,
        color: data.color?.toUpperCase(),
        closingDay: data.closingDay,
        dueDay: data.dueDay
    }, daysChanged ? { closingDay, dueDay } : null, todayInBrazil());

    return { ok: true, data: { recalculatedExpenses: result.recalculatedExpenses } };
}

// A card with expenses or recurrences cannot be deleted (also enforced by the database: ON DELETE RESTRICT).
const remove = async (userLogin: string, data: z.infer<typeof cardSchema.remove>): Promise<CardResult<null>> => {
    const groupId = await getGroupId(userLogin);

    const card = await cardModel.getByIdInGroup(data.id, groupId);
    if (!card) return { ok: false, reason: "NOT_FOUND" };

    if (await cardModel.countUsage(card.id, groupId) > 0) return { ok: false, reason: "IN_USE" };

    const deletedCount = await cardModel.remove(card.id, groupId);
    if (deletedCount === 0) return { ok: false, reason: "NOT_FOUND" };

    return { ok: true, data: null };
}

export default { create, list, update, remove };
