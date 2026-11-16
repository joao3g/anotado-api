import { z } from 'zod';
import { PaymentMethod } from '../generated/prisma/enums.js';

// Money travels as a string ("150.00") and goes straight into Prisma Decimal. No float step.
// Max 8 integer digits fits Decimal(10,2). Zero is not allowed.
const amount = z.string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Invalid amount format")
    .refine(value => /[1-9]/.test(value), "Amount must be greater than zero");

const create = z.object({
    title: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
    amount, // Value of EACH installment, never the total
    startDate: z.iso.date(),
    paymentMethod: z.enum(PaymentMethod),
    category: z.uuid(),
    card: z.uuid().optional(), // Required for CREDIT, ignored otherwise
    isEssential: z.boolean().optional(),
    totalInstallments: z.int().min(2).max(120).nullable() // null = never ends
}).refine(data => data.paymentMethod !== "CREDIT" || data.card, { message: "Card is required for CREDIT", path: ["card"] });

// paymentMethod, card, startDate and totalInstallments are not editable: they would move dates of existing rows.
const update = z.object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    amount: amount.optional(),
    category: z.uuid().optional(),
    isEssential: z.boolean().optional()
});

const cancel = z.object({
    id: z.uuid()
});

export default { create, update, cancel };
