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

const verify = async (token: string) => {
    const ok = await userModel.verifyEmailWithToken(hashEmailToken(token), new Date());

    return ok ? "OK" : "INVALID";
}

export default { sendVerification, resend, verify };
