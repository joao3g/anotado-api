import { z } from 'zod';

// bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently cut.
const newPassword = z.string().min(8).max(72);

const login = z.object({
    login: z.string(),
    password: z.string()
});

const register = z.object({
    login: z.string().trim().min(3).max(50),
    password: newPassword,
    email: z.email(),
    name: z.string().trim().min(1).max(100)
});

// Phone: Brazil, digits only with area code (10 or 11 digits). Empty string = remove the phone.
const updateProfile = z.object({
    name: z.string().trim().min(1).max(100),
    email: z.email(),
    phone: z.union([z.string().regex(/^\d{10,11}$/), z.literal("")]).optional()
});

// JPEG data URL made by the browser (256x256). The same rule is a CHECK constraint in the database.
const updateAvatar = z.object({
    avatar: z.string().max(90000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)
});

const changePassword = z.object({
    currentPassword: z.string().min(1),
    newPassword
});

// "Esqueceu a senha?". Max 254 chars: the longest valid email address.
const forgotPassword = z.object({
    email: z.email().max(254)
});

// The token from the email link: 32 random bytes as base64url (43 chars).
const resetPassword = z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    newPassword
});

export default { login, register, updateProfile, updateAvatar, changePassword, forgotPassword, resetPassword };
