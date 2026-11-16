import 'dotenv/config';
import z from 'zod';
import expenseModel from '../models/expense.model.js';
import userModel from '../models/user.model.js';
import categoryModel from '../models/category.model.js';
import expenseSchema from '../schemas/expense.schema.js';
import { ExpenseCreateInput, ExpenseCreateManyInput } from '../generated/prisma/models.js';
import { calculateNextInvoiceDate } from '../utils/date.js';
import recurrenceService from './recurrence.service.js';

const create = async (userLogin: string, data: z.infer<typeof expenseSchema.create>) => {
    try {
        const userData = await userModel.getByLogin(userLogin);
        if (!userData) throw Error("User not found!");
        if (!userData.group?.id) throw Error("User group not found!");

        // Returns false when the category does not belong to the user's group.
        const category = await categoryModel.getByIdInGroup(data.category, userData.group.id);
        if (!category) return false;

        await expenseModel.create({
            title: data.title,
            description: data.description,
            paymentMethod: data.paymentMethod,
            amount: data.amount,
            transactionDate: new Date(data.date),
            dueDate: data.paymentMethod === "CREDIT" ? calculateNextInvoiceDate(new Date(data.date), 3) : new Date(data.date),
            category: { connect: { id: data.category } },
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

        const toCreateArray: ExpenseCreateManyInput[] = data.map(data => {
            if (!userData.group?.id) throw Error("User group not found!");

            return {
                title: data.title,
                description: data.description,
                paymentMethod: data.paymentMethod,
                amount: data.amount,
                transactionDate: new Date(data.date),
                dueDate: data.paymentMethod === "CREDIT" ? calculateNextInvoiceDate(new Date(data.date), 3) : new Date(data.date),
                categoryId: data.category,
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

// Returns null when the expense (or the new category) does not belong to the user's group.
const update = async (userLogin: string, data: z.infer<typeof expenseSchema.update>) => {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    const currentExpense = await expenseModel.getByIdInGroup(data.id, userData.group.id);
    if (!currentExpense) return null;

    if (data.category) {
        const category = await categoryModel.getByIdInGroup(data.category, userData.group.id);
        if (!category) return null;
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
        category: { connect: { id: data.category ?? currentExpense.categoryId } },
    };

    // dueDate depends on BOTH the date and the payment method, so recompute it when either one is sent.
    // Before, changing only DEBIT -> CREDIT kept dueDate = purchase date (wrong month for the invoice).
    if (data.date || data.paymentMethod) {
        const transactionDate = data.date ? new Date(data.date) : currentExpense.transactionDate;

        toUpdate.transactionDate = transactionDate;
        toUpdate.dueDate = toUpdate.paymentMethod === "CREDIT" ? calculateNextInvoiceDate(transactionDate, 3) : transactionDate;
    }

    return await expenseModel.update(data.id, toUpdate);
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