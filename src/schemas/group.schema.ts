import { z } from 'zod';

const title = z.string().trim().min(1).max(60);

const create = z.object({
    title,
    description: z.string().optional()
});

const getByUserLogin = z.object({
    login: z.string().optional()
});

const updateMine = z.object({
    title
});

// Spaces and dashes removed and upper-cased, so "abcd-2345 " still works when typed by hand.
const join = z.object({
    code: z.string().transform((code) => code.replace(/[\s-]/g, "").toUpperCase()).pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/))
});

// A member of the family, by user id (always checked against the admin's own family).
const memberParams = z.object({
    id: z.uuid()
});

const setMemberRole = z.object({
    role: z.enum(["ADMIN", "MEMBER"])
});

export default { create, getByUserLogin, updateMine, join, memberParams, setMemberRole };
