import 'dotenv/config';
import z from 'zod';
import expenseModel from '../models/expense.model.js';
import userModel from '../models/user.model.js';
import categoryModel from '../models/category.model.js';
import cardModel from '../models/card.model.js';
import expenseSchema from '../schemas/expense.schema.js';
import { ExpenseCreateInput, ExpenseCreateManyInput } from '../generated/prisma/models.js';
import { calculateNextInvoiceDate } from '../utils/date.js';
import recurrenceService from './recurrence.service.js';

export type ExpenseUpdateResult<T> = { ok: true, data: T } | { ok: false, reason: "NOT_FOUND" | "CARD_REQUIRED" };

const create = async (userLogin: string, data: z.infer<typeof expenseSchema.create>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        // Returns false when the category does not belong to the user's group.
        const category = await categoryModel.getByIdInGroup(data.category, userData.group.id);
        if (!category) return false;

        // CREDIT: the card must belong to the group too, and its closing day sets the invoice date.
        // Other methods never keep a card (the database also checks this).
        const card = data.paymentMethod === "CREDIT" && data.card ? await cardModel.getByIdInGroup(data.card, userData.group.id) : null;
        if (data.paymentMethod === "CREDIT" && !card) return false;

        await expenseModel.create({
            title: data.title,
            description: data.description,
            paymentMethod: data.paymentMethod,
            amount: data.amount,
            transactionDate: new Date(data.date),
            dueDate: card ? calculateNextInvoiceDate(new Date(data.date), card) : new Date(data.date),
            category: { connect: { id: data.category } },
            ...(card ? { card: { connect: { id: card.id } } } : {}),
            group: { connect: { id: userData.group.id } }
        });

        return true;
    } catch (error) {
        console.error("[createExpense(service)]: ", error);
        throw error;
    }
}

const createMany = async (userLogin: string, data: z.infer<typeof expenseSchema.createMany>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        // Every category sent must belong to the user's group, or nothing is created (returns false).
        const categoryIds = [...new Set(data.map(item => item.category))];
        const validCount = await categoryModel.countInGroup(categoryIds, userData.group.id);
        if (validCount !== categoryIds.length) return false;

        // Same for the cards of CREDIT items. The map also gives each card's closing and due days.
        const cardIds = [...new Set(data.filter(item => item.paymentMethod === "CREDIT").map(item => item.card as string))];
        const cards = await cardModel.listByIdsInGroup(cardIds, userData.group.id);
        if (cards.length !== cardIds.length) return false;
        const cardById = new Map(cards.map(card => [card.id, card]));

        const toCreateArray: ExpenseCreateManyInput[] = data.map(data => {
            if (!userData.group?.id) throw Error("User group not found!");

            const card = data.paymentMethod === "CREDIT" ? cardById.get(data.card as string) : undefined;

            return {
                title: data.title,
                description: data.description,
                paymentMethod: data.paymentMethod,
                amount: data.amount,
                transactionDate: new Date(data.date),
                dueDate: card !== undefined ? calculateNextInvoiceDate(new Date(data.date), card) : new Date(data.date),
                categoryId: data.category,
                cardId: card !== undefined ? card.id : null,
                groupId: userData.group.id
            }
        });

        await expenseModel.createMany(toCreateArray);

        return true;
    } catch (error) {
        console.error("[createManyExpense(service)]: ", error);
        throw error;
    }
}

const getByMonth = async (userLogin: string, data: z.infer<typeof expenseSchema.getByMonth>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        const startDate = new Date(data.date);
        startDate.setUTCHours(0, 0, 0);
        startDate.setUTCDate(1);

        const endDate = new Date(data.date);
        endDate.setUTCHours(23, 59, 59);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setUTCDate(0);

        // Never-ending recurrences: make sure this month's installments exist (idempotent).
        await recurrenceService.ensureGeneratedForMonth(userData.group.id, endDate);

        return await expenseModel.getByRangeAndTitle(startDate, endDate, userData.group.id);
    } catch (error) {
        console.error("[getByMonth(service)]: ", error);
        throw error;
    }
}

const getByTitle = async (userLogin: string, data: z.infer<typeof expenseSchema.getByTitle>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        if (data.date) {
            const startDate = new Date(data.date);
            startDate.setUTCHours(0, 0, 0);
            startDate.setUTCDate(1);

            const endDate = new Date(data.date);
            endDate.setUTCHours(23, 59, 59);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setUTCDate(0);

            return await expenseModel.getByRangeAndTitle(startDate, endDate, userData.group.id, data.title);
        }

        return await expenseModel.getByTitle(data.title, userData.group.id);
    } catch (error) {
        console.error("[getByTitle(service)]: ", error);
        throw error;
    }
}

const getSummarizedByMonth = async (userLogin: string, data: z.infer<typeof expenseSchema.getSummarizedByMonth>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        const startDate = new Date(data.date);
        startDate.setUTCHours(0, 0, 0);
        startDate.setUTCDate(1);

        const endDate = new Date(data.date);
        endDate.setUTCHours(23, 59, 59);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setUTCDate(0);

        // Never-ending recurrences: make sure this month's installments exist (idempotent).
        await recurrenceService.ensureGeneratedForMonth(userData.group.id, endDate);

        return await expenseModel.getSummarizedByRange(startDate, endDate, userData.group.id);
    } catch (error) {
        console.error("[getSummarizedByMonth(service)]: ", error);
        throw error;
    }
}

// NOT_FOUND when the expense (or the new category/card) does not belong to the user's group.
// CARD_REQUIRED when the result would be CREDIT without a card.
const update = async (userLogin: string, data: z.infer<typeof expenseSchema.update>): Promise<ExpenseUpdateResult<Awaited<ReturnType<typeof expenseModel.update>>>> => {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    const currentExpense = await expenseModel.getByIdInGroup(data.id, userData.group.id);
    if (!currentExpense) return { ok: false, reason: "NOT_FOUND" };

    if (data.category) {
        const category = await categoryModel.getByIdInGroup(data.category, userData.group.id);
        if (!category) return { ok: false, reason: "NOT_FOUND" };
    }

    // CREDIT keeps (or gets) a card from the group. Any other method drops the card.
    const paymentMethod = data.paymentMethod ?? currentExpense.paymentMethod;
    let card: { id: string, closingDay: number, dueDay: number } | null = null;
    if (paymentMethod === "CREDIT") {
        const cardId = data.card ?? currentExpense.cardId;
        if (!cardId) return { ok: false, reason: "CARD_REQUIRED" };

        card = await cardModel.getByIdInGroup(cardId, userData.group.id);
        if (!card) return { ok: false, reason: "NOT_FOUND" };
    }

    // `??` (not `||`): only a field that was NOT sent keeps its current value.
    // So an empty description clears it. Empty title and amount <= 0 are rejected by the Zod schema.
    const toUpdate = {
        id: currentExpense.id,
        title: data.title ?? currentExpense.title,
        description: data.description ?? currentExpense.description,
        amount: data.amount ?? currentExpense.amount,
        paymentMethod: data.paymentMethod ?? currentExpense.paymentMethod,
        transactionDate: data.date ?? currentExpense.transactionDate,
        dueDate: data.date ?? currentExpense.dueDate,
        group: { connect: { id: currentExpense.groupId } },
        // Connect only a category that was sent. Not sent = keep the current one, even when it is null (deleted category).
        ...(data.category ? { category: { connect: { id: data.category } } } : {}),
        card: card ? { connect: { id: card.id } } : { disconnect: true },
    };

    // dueDate depends on the date, the payment method AND the card's closing and due days, so recompute it when any of them is sent.
    if (data.date || data.paymentMethod || data.card) {
        const transactionDate = data.date ? new Date(data.date) : currentExpense.transactionDate;

        toUpdate.transactionDate = transactionDate;
        toUpdate.dueDate = card ? calculateNextInvoiceDate(transactionDate, card) : transactionDate;
    }

    return { ok: true, data: await expenseModel.update(data.id, toUpdate) };
}

// Returns false when nothing was deleted (not found, or belongs to another group).
const remove = async (userLogin: string, data: z.infer<typeof expenseSchema.remove>) => {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    const deletedCount = await expenseModel.remove(data.id, userData.group.id);

    return deletedCount > 0;
}

export default { create, createMany, getByMonth, getByTitle, getSummarizedByMonth, update, remove };