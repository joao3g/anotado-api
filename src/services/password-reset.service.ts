import userModel from '../models/user.model.js';
import emailService from './email.service.js';
import { emailConfig, isEmailEnabled } from '../utils/email-config.js';
import { escapeHtml, hashEmailToken, newEmailToken } from '../utils/email-token.js';

const LINK_MINUTES = 30;
const MIN_MINUTES_BETWEEN_EMAILS = 2;

function buildEmail(user: { login: string, name: string | null }, link: string) {
    const greeting = user.name ? `Olá, ${user.name}!` : "Olá!";

    const text = [
        greeting,
        "",
        "Recebemos um pedido para redefinir a senha da sua conta no Anotado.",
        `Seu login: ${user.login}`,
        "",
        `Para criar uma nova senha, abra este link (vale por ${LINK_MINUTES} minutos e só pode ser usado uma vez):`,
        link,
        "",
        "Se não foi você, ignore este e-mail: sua senha continua a mesma."
    ].join("\n");

    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 480px;">
            <p>${escapeHtml(greeting)}</p>
            <p>Recebemos um pedido para redefinir a senha da sua conta no Anotado.</p>
            <p>Seu login: <strong>${escapeHtml(user.login)}</strong></p>
            <p style="margin: 24px 0;">
                <a href="${escapeHtml(link)}" style="background: #0F5E59; color: #FFF6E5; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: bold;">Redefinir senha</a>
            </p>
            <p style="font-size: 13px; color: #4b5563;">O link vale por ${LINK_MINUTES} minutos e só pode ser usado uma vez.</p>
            <p style="font-size: 13px; color: #4b5563;">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
        </div>`;

    return { subject: "Redefinir sua senha do Anotado", text, html };
}

// Sends a reset link to every account with this email. Says nothing about whether the email exists:
// the controller answers before this runs, and this never throws to the client.
const requestReset = async (email: string) => {
    if (!isEmailEnabled()) return console.log("[passwordReset]: email is not configured (RESEND_API_KEY, EMAIL_FROM, APP_URL); no email sent");

    const users = await userModel.listForPasswordReset(email.trim());
    const now = Date.now();

    for (const user of users) {
        if (!user.email) continue;

        const lastRequest = user.passwordResetToken?.createdAt.getTime();
        if (lastRequest !== undefined && now - lastRequest < MIN_MINUTES_BETWEEN_EMAILS * 60_000) continue;

        const { token, hash } = newEmailToken();
        await userModel.savePasswordResetToken(user.id, hash, new Date(now + LINK_MINUTES * 60_000));

        // In the URL hash (#): browsers never send it to a server, so it is not in any request log.
        const link = `${emailConfig.appUrl}/reset-password#token=${token}`;
        const sent = await emailService.sendEmail({ to: user.email, ...buildEmail(user, link) });
        if (!sent) console.error("[passwordReset]: reset email not sent");
    }
}

const resetPassword = async (token: string, newPassword: string) => {
    const ok = await userModel.resetPasswordWithToken(hashEmailToken(token), newPassword, new Date());

    return ok ? "OK" : "INVALID";
}

export default { requestReset, resetPassword };
