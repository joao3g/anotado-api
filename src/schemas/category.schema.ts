import { z } from 'zod';

const create = z.object({
    title: z.string(),
    color: z.hex(),
    description: z.string().optional()
});

const getByUserLogin = z.object({
    login: z.string().optional()
});

// Fields not sent keep their current value. Fields sent must be valid: no empty title, color must be hex (same rule as create).
const update = z.object({
    id: z.string(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    color: z.hex().optional()
});

const remove = z.object({
    id: z.string()
});

export default { create, getByUserLogin, update, remove };