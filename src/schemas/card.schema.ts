import { z } from 'zod';

// Exactly 4 digits, kept as a string so "0123" keeps its leading zero. A full card number is never accepted.
const lastFourDigits = z.string().regex(/^\d{4}$/, "Must be exactly 4 digits");

// 1..27: the invoice day (closingDay + 1) must exist in every month. 28 would give Feb 29 -> Mar 1 in non-leap years.
const closingDay = z.int().min(1).max(27);

// Hex WITHOUT "#", exactly 6 chars (z.hex() alone accepts any length). Same format as category colors.
const color = z.string().regex(/^[0-9A-Fa-f]{6}$/, "Must be a 6-char hex color without #");

const create = z.object({
    title: z.string().trim().min(1).max(50),
    lastFourDigits: lastFourDigits.optional(),
    color,
    closingDay
});

// Fields not sent keep their current value. An empty lastFourDigits ("") clears it.
const update = z.object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(50).optional(),
    lastFourDigits: z.union([lastFourDigits, z.literal("")]).optional(),
    color: color.optional(),
    closingDay: closingDay.optional()
});

const remove = z.object({
    id: z.uuid()
});

export default { create, update, remove };
