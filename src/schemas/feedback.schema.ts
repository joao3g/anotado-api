import { z } from 'zod';
import { FeedbackType } from '../generated/prisma/enums.js';

// Counted in characters (code points), like the database CHECK: an emoji is 1, not 2.
const charCount = (text: string) => [...text].length;

const create = z.object({
    type: z.enum(FeedbackType),
    message: z.string().trim()
        .refine(text => charCount(text) >= 10, "Message must have at least 10 characters")
        .refine(text => charCount(text) <= 2000, "Message must have at most 2000 characters"),
    // Context to help find bugs. Cut instead of rejected: a long URL or browser name must not block a report.
    page: z.string().optional().transform(value => value?.slice(0, 300) || undefined),
    userAgent: z.string().optional().transform(value => value?.slice(0, 300) || undefined)
});

export default { create };
