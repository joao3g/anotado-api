import 'dotenv/config';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Group from '../models/group.model.js';
import { JwtUserPayload } from '../types/jwt.js';
import emailVerificationService from './email-verification.service.js';
import { isEmailEnabled } from '../utils/email-config.js';

const SECRET_KEY = process.env["SECRET_KEY"];
if (!SECRET_KEY) throw new Error("Invalid SECRET_KEY!");

// What /auth/me and login return. Read from the database, so changes show without a new login.
// Never the password hash. group is null until the user joins or creates a family.
const getMe = async (login: string) => {
    const profile = await User.getProfileByLogin(login);
    if (!profile) return null;

    return {
        login: profile.login,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        avatar: profile.avatar,
        pendingEmail: profile.pendingEmail, // New email waiting for its link (Settings > Perfil), or null
        group: profile.group ?
            { title: profile.group.title, totalMembers: await Group.countUsersByGroup(profile.group.id), role: profile.role }
            : null
    };
}

const login = async (login: string, password: string) => {
    try {
        const userData = await User.getForAuthByLogin(login);
        if (!userData) throw new Error("User not found!");

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);

        if (!isPasswordCorrect) throw new Error("Incorrect password!");

        // Checked only after the right password, so it never tells a stranger that an account exists.
        if (!userData.emailVerifiedAt) return { status: "EMAIL_NOT_VERIFIED" as const, email: userData.email ?? "" };

        // A user without a family can log in: the app then asks for a family code or a new family.
        const user = await getMe(login);
        if (!user) throw new Error("User not found!");

        const payload: JwtUserPayload = {
            login,
            name: user.name ?? "",
            email: user.email ?? "",
            // Without the role: the token lives for a year, so it would go stale. The API reads the role from the database.
            group: user.group ? { title: user.group.title, totalMembers: user.group.totalMembers } : null
        };

        return {
            status: "OK" as const,
            token: jwt.sign(
                payload,
                SECRET_KEY,
                { expiresIn: '1Yr' }
            ),
            user
        };
    } catch (error) {
        console.error("[login(service)]: ", error);
        throw error;
    }
}

// A new email is not saved as the email: it waits in pendingEmail until the link sent to it is opened
// (the old email keeps working meanwhile). The controller sends the emails after answering.
// Only a change of upper/lower case, or no email settings (local dev), saves the email at once.
const updateProfile = async (login: string, data: { name: string, email: string, phone?: string }) => {
    const user = await User.getForEmailChange(login);
    if (!user) throw new Error("User not found!");

    const newEmail = data.email.trim();
    const sameMailbox = (user.email ?? "").toLowerCase() === newEmail.toLowerCase();
    const changeAtOnce = sameMailbox || !isEmailEnabled();

    if (!sameMailbox && await User.emailUsedByOther(newEmail, user.id)) return { status: "EMAIL_TAKEN" as const };

    // At most one link every 2 minutes: otherwise saving a different email again and again would send
    // unlimited emails to any address. The same pending email saved again just sends nothing new.
    const samePending = (user.pendingEmail ?? "").toLowerCase() === newEmail.toLowerCase();
    const tooSoon = !changeAtOnce && emailVerificationService.sentRecently(user.emailVerificationToken);
    if (tooSoon && !samePending) return { status: "TOO_SOON" as const };

    await User.updateProfile(user.id, {
        name: data.name,
        // Not sent = keep; "" = remove
        ...(data.phone !== undefined ? { phone: data.phone === "" ? null : data.phone } : {}),
        // Saving the same email (e.g. only the name changed) keeps a pending change as it is.
        ...(changeAtOnce ? { email: newEmail } : { pendingEmail: newEmail }),
        ...(!sameMailbox && changeAtOnce ? { pendingEmail: null } : {})
    });

    if (changeAtOnce) return { status: "SAVED" as const };

    return { status: "EMAIL_CHANGE_PENDING" as const, sendEmails: !tooSoon, user, oldEmail: user.email, newEmail };
}

const setAvatar = async (login: string, avatar: string | null) => {
    const userData = await User.getByLogin(login);
    if (!userData) throw new Error("User not found!");

    await User.updateProfile(userData.id, { avatar });
}

// Returns "WRONG_PASSWORD" or "SAME_PASSWORD" instead of throwing, so the controller can answer 400.
const changePassword = async (login: string, currentPassword: string, newPassword: string) => {
    const userData = await User.getForAuthByLogin(login);
    if (!userData) throw new Error("User not found!");

    if (!await bcrypt.compare(currentPassword, userData.password)) return "WRONG_PASSWORD";
    if (await bcrypt.compare(newPassword, userData.password)) return "SAME_PASSWORD";

    // userModel.update hashes the password.
    await User.update(userData.id, { password: newPassword });

    return "OK";
}

export default { login, getMe, updateProfile, setAvatar, changePassword };
