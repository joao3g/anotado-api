import { z } from 'zod';

// > 0, at most 2 decimals (no silent rounding by the database), and fits Decimal(10,2).
const amount = z.number().positive().multipleOf(0.01).max(99999999.99);

const create = z.object({
    title: z.string(),
    date: z.iso.date(),
    amount
});

const getById = z.object({
    id: z.string()
});

const getByUser = z.object({
    id: z.string().optional()
});

const totalByRange = z.object({
    startDate: z.iso.date(),
    endDate: z.iso.date()
});

const getByGroup = z.object({
    id: z.string().optional()
});

const getByDate = z.object({
    date: z.iso.date()
});

// Fields not sent keep their current value. Fields sent must be valid: no empty title, no amount <= 0.
const update = z.object({
    id: z.string(),
    title: z.string().min(1).optional(),
    date: z.iso.date().optional(),
    amount: amount.optional()
});

const remove = z.object({
    id: z.string()
});

export default { create, getById, getByDate, getByUser, getByGroup, totalByRange, update, remove };