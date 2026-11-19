import { Prisma } from '../generated/prisma/client.js';
import userModel from '../models/user.model.js';
import emailService from './email.service.js';
import { emailConfig, isEmailEnabled } from '../utils/email-config.js';
import { escapeHtml, hashEmailToken, newEmailToken } from '../utils/email-token.js';

const LINK_HOURS = 24;
const MIN_MINUTES_BETWEEN_EMAILS = 2;

type UserToVerify = { id: string, login: string, name: string | null, email: string | null };

function buildEmail(user: UserToVerify, link: string) {
    const greeting = user.name ? `Olá, ${user.name}!` : "Olá!";

    const text = [
        greeting,
        "",
        "Falta pouco para usar o Anotado: confirme seu e-mail.",
        `Seu login: ${user.login}`,
        "",
        `Abra este link para confirmar (vale por ${LINK_HOURS} horas e só pode ser usado uma vez):`,
        link,
        "",
        "Se você não criou uma conta no Anotado, ignore este e-mail."
    ].join("\n");

    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 480px;">
            <p>${escapeHtml(greeting)}</p>
            <p>Falta pouco para usar o Anotado: confirme seu e-mail.</p>
            <p>Seu login: <strong>${escapeHtml(user.login)}</strong></p>
            <p style="margin: 24px 0;">
                <a href="${escapeHtml(link)}" style="background: #0F5E59; color: #FFF6E5; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: bold;">Confirmar e-mail</a>
            </p>
            <p style="font-size: 13px; color: #4b5563;">O link vale por ${LINK_HOURS} horas e só pode ser usado uma vez.</p>
            <p style="font-size: 13px; color: #4b5563;">Se você não criou uma conta no Anotado, ignore este e-mail.</p>
        </div>`;

    return { subject: "Confirme seu e-mail no Anotado", text, html };
}

// Creates a new link (replacing the old one) and emails it. Never throws to the client: it runs after the response.
const sendVerification = async (user: UserToVerify) => {
    if (!user.email) return;

    const { token, hash } = newEmailToken();
    await userModel.saveEmailVerificationToken(user.id, hash, new Date(Date.now() + LINK_HOURS * 3_600_000));

    // In the URL hash (#): browsers never send it to a server, so it is not in any request log.
    const link = `${emailConfig.appUrl}/verify-email#token=${token}`;
    const sent = await emailService.sendEmail({ to: user.email, ...buildEmail(user, link) });
    if (!sent) console.error("[emailVerification]: verification email not sent");
}

// "Reenviar e-mail". Says nothing about whether the email exists or is already confirmed.
const resend = async (email: string) => {
    if (!isEmailEnabled()) return console.log("[emailVerification]: email is not configured; no email sent");

    const users = await userModel.listForVerificationResend(email.trim());
    const now = Date.now();

    for (const user of users) {
        const lastRequest = user.emailVerificationToken?.createdAt.getTime();
        if (lastRequest !== undefined && now - lastRequest < MIN_MINUTES_BETWEEN_EMAILS * 60_000) continue;

        await sendVerification(user);
    }
}

// "INVALID" | "VERIFIED" (sign-up) | "EMAIL_CHANGED" (Perfil) | "EMAIL_TAKEN" (another account got the new email first)
const verify = async (token: string) => {
    try {
        return await userModel.verifyEmailWithToken(hashEmailToken(token), new Date());
    } catch (error) {
        // Another account saved the same email between the check and the update (unique email).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "EMAIL_TAKEN" as const;
        throw error;
    }
}

// --- Email change (Settings > Perfil) ---

// "joao@gmail.com" -> "j•••@gmail.com": the warning to the old address does not show the whole new one.
const maskEmail = (email: string) => {
    const [name, domain] = email.split("@");
    return `${(name ?? "").slice(0, 1)}•••@${domain ?? ""}`;
}

type ChangingUser = { id: string, login: string, name: string | null };

function buildChangeLinkEmail(user: ChangingUser, link: string) {
    const greeting = user.name ? `Olá, ${user.name}!` : "Olá!";

    const text = [
        greeting,
        "",
        "Você pediu para usar este e-mail na sua conta do Anotado.",
        `Seu login: ${user.login}`,
        "",
        `Abra este link para confirmar (vale por ${LINK_HOURS} horas e só pode ser usado uma vez):`,
        link,
        "",
        "Até confirmar, a conta continua com o e-mail antigo. Se não foi você, ignore este e-mail."
    ].join("\n");

    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 480px;">
            <p>${escapeHtml(greeting)}</p>
            <p>Você pediu para usar este e-mail na sua conta do Anotado.</p>
            <p>Seu login: <strong>${escapeHtml(user.login)}</strong></p>
            <p style="margin: 24px 0;">
                <a href="${escapeHtml(link)}" style="background: #0F5E59; color: #FFF6E5; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: bold;">Confirmar novo e-mail</a>
            </p>
            <p style="font-size: 13px; color: #4b5563;">O link vale por ${LINK_HOURS} horas e só pode ser usado uma vez. Até confirmar, a conta continua com o e-mail antigo.</p>
            <p style="font-size: 13px; color: #4b5563;">Se não foi você, ignore este e-mail.</p>
        </div>`;

    return { subject: "Confirme seu novo e-mail no Anotado", text, html };
}

function buildChangeNoticeEmail(user: ChangingUser, newEmail: string) {
    const greeting = user.name ? `Olá, ${user.name}!` : "Olá!";
    const masked = maskEmail(newEmail);

    const text = [
        greeting,
        "",
        `Pediram para trocar o e-mail da sua conta do Anotado (login: ${user.login}) para ${masked}.`,
        "O e-mail só muda depois que o link enviado ao novo endereço for aberto.",
        "",
        "Se não foi você, entre no Anotado, cancele a troca em Configurações > Perfil e troque sua senha."
    ].join("\n");

    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 480px;">
            <p>${escapeHtml(greeting)}</p>
            <p>Pediram para trocar o e-mail da sua conta do Anotado (login: <strong>${escapeHtml(user.login)}</strong>) para <strong>${escapeHtml(masked)}</strong>.</p>
            <p>O e-mail só muda depois que o link enviado ao novo endereço for aberto.</p>
            <p style="font-size: 13px; color: #4b5563;">Se não foi você, entre no Anotado, cancele a troca em Configurações &gt; Perfil e troque sua senha.</p>
        </div>`;

    return { subject: "Pedido para trocar o e-mail da sua conta", text, html };
}

// New link to the pending email (replaces the old link). Runs after the response; never throws to the client.
const sendEmailChangeLink = async (user: ChangingUser, newEmail: string) => {
    const { token, hash } = newEmailToken();
    await userModel.saveEmailVerificationToken(user.id, hash, new Date(Date.now() + LINK_HOURS * 3_600_000));

    const link = `${emailConfig.appUrl}/verify-email#token=${token}`;
    const sent = await emailService.sendEmail({ to: newEmail, ...buildChangeLinkEmail(user, link) });
    if (!sent) console.error("[emailChange]: confirmation email not sent");
}

// Warning to the current address: someone asked to move the account to another email.
const sendEmailChangeNotice = async (user: ChangingUser, oldEmail: string, newEmail: string) => {
    const sent = await emailService.sendEmail({ to: oldEmail, ...buildChangeNoticeEmail(user, newEmail) });
    if (!sent) console.error("[emailChange]: notice to the old email not sent");
}

// True when a link was sent less than 2 minutes ago.
const sentRecently = (lastLink: { createdAt: Date } | null) =>
    lastLink !== null && Date.now() - lastLink.createdAt.getTime() < MIN_MINUTES_BETWEEN_EMAILS * 60_000;

// "Reenviar e-mail" in Perfil. "NO_PENDING" | "TOO_SOON" | "OK"
const resendEmailChange = async (login: string) => {
    const user = await userModel.getForEmailChange(login);
    if (!user) throw new Error("User not found!");
    if (!user.pendingEmail) return "NO_PENDING" as const;
    if (sentRecently(user.emailVerificationToken)) return "TOO_SOON" as const;

    await sendEmailChangeLink(user, user.pendingEmail);
    return "OK" as const;
}

// "Cancelar troca": the old link stops working.
const cancelEmailChange = async (login: string) => {
    const user = await userModel.getForEmailChange(login);
    if (!user) throw new Error("User not found!");

    await userModel.cancelPendingEmail(user.id);
}

export default { sendVerification, resend, verify, sendEmailChangeLink, sendEmailChangeNotice, sentRecently, resendEmailChange, cancelEmailChange };
