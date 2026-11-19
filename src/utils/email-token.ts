import { createHash, randomBytes } from 'node:crypto';

// One-time tokens sent in email links (password reset, email verification).
// 32 random bytes = 43 base64url chars: impossible to guess. Only the SHA-256 hash is stored.
export const EMAIL_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export const hashEmailToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newEmailToken() {
    const token = randomBytes(32).toString("base64url");

    return { token, hash: hashEmailToken(token) };
}

// Text typed by users (name, login) inside email HTML.
export const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
