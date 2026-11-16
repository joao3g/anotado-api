import 'dotenv/config';
import z from 'zod';
import userModel from '../models/user.model.js';
import recurrenceModel, { InstallmentInput, RecurrenceEditableFields } from '../models/recurrence.model.js';
import recurrenceSchema from '../schemas/recurrence.schema.js';
import { Prisma } from '../generated/prisma/client.js';
import { PaymentMethod } from '../generated/prisma/enums.js';
import { addMonthsClamped, calculateNextInvoiceDate, endOfMonth, todayInBrazil } from '../utils/date.js';

const OPEN_ENDED_MONTHS_AHEAD = 12; // Never-ending series: keep 12 months of installments created
const MAX_INSTALLMENTS_PER_RUN = 120; // Safety cap for one top-up of one series

export type ServiceResult<T> = { ok: true, data: T } | { ok: false, reason: "NOT_FOUND" | "ALREADY_CANCELED" };

type RecurrenceBase = {
    title: string
    description: string | null
    amount: Prisma.Decimal | string
    paymentMethod: PaymentMethod
    isEssential: boolean | null
    startDate: Date
    totalInstallments: number | null
    categoryId: string | null // null when the category was deleted
    cardId: string | null // Set only for CREDIT
    groupId: string
}

// Closing day of the series' card. Not stored on the series: it is read from the card every time.
type RecurrenceWithClosingDay = RecurrenceBase & { closingDay: number | null }

async function getGroupId(userLogin: string) {
    const userData = await userModel.getByLogin(userLogin);
    if (!userData) throw Error("User not found!");
    if (!userData.group?.id) throw Error("User group not found!");

    return userData.group.id;
}

// Last day of the window for never-ending series: end of (current month + 11).
function openEndedHorizon() {
    return endOfMonth(addMonthsClamped(todayInBrazil(), OPEN_ENDED_MONTHS_AHEAD - 1));
}

// Installment #number. Dates always come from the anchor (startDate), never from the previous installment.
// The amount is copied as-is: it is the value of EACH installment. No division, no rounding.
function buildInstallment(recurrence: RecurrenceWithClosingDay, number: number): InstallmentInput {
    const transactionDate = addMonthsClamped(recurrence.startDate, number - 1);

    return {
        title: recurrence.title,
        description: recurrence.description,
        amount: recurrence.amount,
        paymentMethod: recurrence.paymentMethod,
        isEssential: recurrence.isEssential,
        transactionDate,
        dueDate: recurrence.closingDay !== null ? calculateNextInvoiceDate(transactionDate, recurrence.closingDay) : transactionDate,
        categoryId: recurrence.categoryId,
        cardId: recurrence.cardId,
        groupId: recurrence.groupId,
        installmentNumber: number
    };
}

// Builds installments from `fromNumber` on. Finite series stop at totalInstallments.
// Never-ending series stop when dueDate passes `until`.
function buildInstallments(recurrence: RecurrenceWithClosingDay, fromNumber: number, until: Date) {
    const installments: InstallmentInput[] = [];

    for (let number = fromNumber; installments.length < MAX_INSTALLMENTS_PER_RUN; number++) {
        if (recurrence.totalInstallments !== null && number > recurrence.totalInstallments) break;

        const installment = buildInstallment(recurrence, number);
        if (recurrence.totalInstallments === null && (installment.dueDate as Date) > until) break;

        installments.push(installment);
    }

    return installments;
}

// Creates missing installments of never-ending series, up to `until`. Safe to call many times.
const ensureGeneratedUntil = async (groupId: string, until: Date) => {
    const recurrences = await recurrenceModel.listOpenEndedActive(groupId);

    for (const recurrence of recurrences) {
        // CREDIT series always have a card (database CHECK). Defensive: skip if not, never guess a closing day.
        if (recurrence.paymentMethod === "CREDIT" && !recurrence.card) continue;

        const installments = buildInstallments({ ...recurrence, closingDay: recurrence.card?.closingDay ?? null }, recurrence.generatedCount + 1, until);
        if (installments.length) await recurrenceModel.appendInstallments(recurrence.id, recurrence.generatedCount, installments);
    }
}

// Called when a month is read: never-ending series get installments up to that month,
// and at least up to the rolling 12-month window (which moves forward as time passes).
const ensureGeneratedForMonth = async (groupId: string, monthEnd: Date) => {
    const horizon = openEndedHorizon();
    await ensureGeneratedUntil(groupId, monthEnd > horizon ? monthEnd : horizon);
}

const create = async (userLogin: string, data: z.infer<typeof recurrenceSchema.create>): Promise<ServiceResult<{ id: string, generatedInstallments: number }>> => {
    try {
        const groupId = await getGroupId(userLogin);

        const category = await recurrenceModel.findCategoryInGroup(data.category, groupId);
        if (!category) return { ok: false, reason: "NOT_FOUND" };

        // CREDIT: the card must belong to the group. Other methods never keep a card.
        const card = data.paymentMethod === "CREDIT" && data.card ? await recurrenceModel.findCardInGroup(data.card, groupId) : null;
        if (data.paymentMethod === "CREDIT" && !card) return { ok: false, reason: "NOT_FOUND" };

        const recurrence: RecurrenceBase = {
            title: data.title,
            description: data.description ?? null,
            amount: data.amount,
            paymentMethod: data.paymentMethod,
            isEssential: data.isEssential ?? null,
            startDate: new Date(data.startDate),
            totalInstallments: data.totalInstallments,
            categoryId: category.id,
            cardId: card?.id ?? null,
            groupId
        };

        const installments = buildInstallments({ ...recurrence, closingDay: card?.closingDay ?? null }, 1, openEndedHorizon());
        const created = await recurrenceModel.create(recurrence, installments);

        return { ok: true, data: { id: created.id, generatedInstallments: installments.length } };
    } catch (error) {
        console.error("[createRecurrence(service)]: ", error);
        throw error;
    }
}

const list = async (userLogin: string) => {
    try {
        const groupId = await getGroupId(userLogin);
        const today = todayInBrazil();

        await ensureGeneratedUntil(groupId, openEndedHorizon());

        const { recurrences, future, past } = await recurrenceModel.listByGroup(groupId, today);

        return recurrences.map(recurrence => {
            const futureStats = future.find(item => item.recurrenceId === recurrence.id);
            const pastStats = past.find(item => item.recurrenceId === recurrence.id);
            const futureCount = futureStats?._count._all ?? 0;
            const isFinite = recurrence.totalInstallments !== null;

            return {
                id: recurrence.id,
                title: recurrence.title,
                description: recurrence.description,
                amount: recurrence.amount.toFixed(2),
                paymentMethod: recurrence.paymentMethod,
                isEssential: recurrence.isEssential,
                startDate: recurrence.startDate,
                totalInstallments: recurrence.totalInstallments,
                canceledAt: recurrence.canceledAt,
                category: recurrence.category,
                card: recurrence.card,
                createdAt: recurrence.createdAt,
                pastCount: pastStats?._count._all ?? 0,
                futureCount,
                // Decimal sum from the database, sent as a string. Only meaningful for finite series.
                remainingAmount: isFinite ? (futureStats?._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) : null,
                nextDueDate: futureStats?._min.dueDate ?? null,
                status: recurrence.canceledAt ? "CANCELED" : (isFinite && futureCount === 0 ? "FINISHED" : "ACTIVE")
            };
        });
    } catch (error) {
        console.error("[listRecurrences(service)]: ", error);
        throw error;
    }
}

const update = async (userLogin: string, data: z.infer<typeof recurrenceSchema.update>): Promise<ServiceResult<{ updatedInstallments: number }>> => {
    try {
        const groupId = await getGroupId(userLogin);

        const recurrence = await recurrenceModel.getById(data.id, groupId);
        if (!recurrence) return { ok: false, reason: "NOT_FOUND" };
        if (recurrence.canceledAt) return { ok: false, reason: "ALREADY_CANCELED" };

        if (data.category) {
            const category = await recurrenceModel.findCategoryInGroup(data.category, groupId);
            if (!category) return { ok: false, reason: "NOT_FOUND" };
        }

        // Undefined keys are ignored by Prisma, so only the fields sent by the client change.
        const fields: RecurrenceEditableFields = {
            title: data.title,
            description: data.description,
            amount: data.amount,
            categoryId: data.category,
            isEssential: data.isEssential
        };

        const result = await recurrenceModel.updateFuture(recurrence.id, groupId, todayInBrazil(), fields);
        if (!result) return { ok: false, reason: "ALREADY_CANCELED" };

        return { ok: true, data: result };
    } catch (error) {
        console.error("[updateRecurrence(service)]: ", error);
        throw error;
    }
}

const cancel = async (userLogin: string, data: z.infer<typeof recurrenceSchema.cancel>): Promise<ServiceResult<{ removedInstallments: number }>> => {
    try {
        const groupId = await getGroupId(userLogin);

        const recurrence = await recurrenceModel.getById(data.id, groupId);
        if (!recurrence) return { ok: false, reason: "NOT_FOUND" };
        if (recurrence.canceledAt) return { ok: false, reason: "ALREADY_CANCELED" };

        const result = await recurrenceModel.cancel(recurrence.id, groupId, todayInBrazil());
        if (!result) return { ok: false, reason: "ALREADY_CANCELED" };

        return { ok: true, data: result };
    } catch (error) {
        console.error("[cancelRecurrence(service)]: ", error);
        throw error;
    }
}

export default { create, list, update, cancel, ensureGeneratedUntil, ensureGeneratedForMonth };
