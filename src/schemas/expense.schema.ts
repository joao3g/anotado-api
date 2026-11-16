import { z } from 'zod';
import { PaymentMethod } from '../generated/prisma/enums.js';

// > 0, at most 2 decimals (no silent rounding by the database), and fits Decimal(10,2).
const amount = z.float64().positive().multipleOf(0.01).max(99999999.99);

const create = z.object({
    title: z.string(),
    description: z.string().optional(),
    amount,
    date: z.iso.date(),
    paymentMethod: z.enum(PaymentMethod),
    category: z.string(),
    card: z.uuid().optional() // Required for CREDIT, ignored otherwise
}).refine(data => data.paymentMethod !== "CREDIT" || data.card, { message: "Card is required for CREDIT", path: ["card"] });

const createMany = z.array(create);

const getByMonth = z.object({
    date: z.iso.date()
});

const totalByRange = z.object({
    startDate: z.iso.date(),
    endDate: z.iso.date()
});

const getByTitle = z.object({
    date: z.iso.date().optional(),
    title: z.string()
});

const getSummarizedByMonth = z.object({
    date: z.iso.date()
});

// Fields not sent keep their current value. Fields sent must be valid: no empty title, no amount <= 0, no empty category.
const update = z.object({
    id: z.string(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    amount: amount.optional(),
    date: z.iso.date().optional(),
    paymentMethod: z.enum(PaymentMethod).optional(),
    category: z.string().min(1).optional(),
    // Not sent = keep the current card. The service rejects CREDIT without a card (sent or current).
    card: z.uuid().optional()
});

const remove = z.object({
    id: z.string()
});

export default { create, createMany, getByMonth, getSummarizedByMonth, getByTitle, totalByRange, update, remove };