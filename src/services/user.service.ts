import 'dotenv/config';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Group from '../models/group.model.js';
import { JwtUserPayload } from '../types/jwt.js';

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
        group: profile.group ?
            { title: profile.group.title, totalMembers: await Group.countUsersByGroup(profile.group.id) }
            : null
    };
}

const login = async (login: string, password: string) => {
    try {
        const userData = await User.getForAuthByLogin(login);
        if (!userData) throw new Error("User not found!");

        const isPasswordCorrect = await bcrypt.compare(password, userData.password);

        if (!isPasswordCorrect) throw new Error("Incorrect password!");

        // A user without a family can log in: the app then asks for a family code or a new family.
        const user = await getMe(login);
        if (!user) throw new Error("User not found!");

        const payload: JwtUserPayload = {
            login,
            name: user.name ?? "",
            email: user.email ?? "",
            group: user.group
        };

        return {
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

const updateProfile = async (login: string, data: { name: string, email: string, phone?: string }) => {
    const userData = await User.getByLogin(login);
    if (!userData) throw new Error("User not found!");

    await User.updateProfile(userData.id, {
        name: data.name,
        email: data.email,
        // Not sent = keep; "" = remove
        ...(data.phone !== undefined ? { phone: data.phone === "" ? null : data.phone } : {})
    });
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
