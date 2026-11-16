import { z } from 'zod';

const title = z.string().trim().min(1).max(60);

const create = z.object({
    title,
    description: z.string().optional()
});

const getByUserLogin = z.object({
    login: z.string().optional()
});

const update = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional()
});

const remove = z.object({
    id: z.string()
});

const updateMine = z.object({
    title
});

// Spaces and dashes removed and upper-cased, so "abcd-2345 " still works when typed by hand.
const join = z.object({
    code: z.string().transform((code) => code.replace(/[\s-]/g, "").toUpperCase()).pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/))
});

export default { create, getByUserLogin, update, remove, updateMine, join };
