import z from 'zod';
import userModel from '../models/user.model.js';
import feedbackModel from '../models/feedback.model.js';
import feedbackSchema from '../schemas/feedback.schema.js';
import emailService from './email.service.js';
import { emailConfig, isFeedbackEmailEnabled } from '../utils/email-config.js';
import { escapeHtml } from '../utils/email-token.js';

const MAX_PER_HOUR = 5;
const TYPE_LABEL = { BUG: "Problema no app", COMPLAINT: "Reclamação" } as const;

type FeedbackInput = z.infer<typeof feedbackSchema.create>;
type Sender = { login: string, name: string | null, email: string | null, group: { title: string } | null };

function buildEmail(id: string, input: FeedbackInput, user: Sender, createdAt: Date) {
    // The subject is one line: line breaks from the message are removed.
    const preview = input.message.replace(/\s+/g, " ").slice(0, 60);
    const subject = `[Anotado] ${TYPE_LABEL[input.type]}: ${preview}${input.message.length > 60 ? "…" : ""}`;

    const details: [string, string][] = [
        ["Tipo", TYPE_LABEL[input.type]],
        ["Usuário", `${user.name ?? "-"} (login: ${user.login})`],
        ["E-mail", user.email ?? "-"],
        ["Família", user.group?.title ?? "sem família"],
        ["Página", input.page ?? "-"],
        ["Navegador", input.userAgent ?? "-"],
        ["Enviado em", createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
        ["ID", id]
    ];

    const text = [
        input.message,
        "",
        "---",
        ...details.map(([label, value]) => `${label}: ${value}`),
        "",
        "Responder este e-mail responde ao usuário."
    ].join("\n");

    // Everything written by the user is escaped: the message is untrusted text.
    const html = `
        <div style="font-family: Arial, sans-serif; font-size: 15px; color: #1f2937; max-width: 600px;">
            <p style="white-space: pre-wrap; padding: 12px 16px; background: #f8fafc; border-radius: 12px;">${escapeHtml(input.message)}</p>
            <table style="font-size: 13px; color: #4b5563; border-collapse: collapse;">
                ${details.map(([label, value]) => `<tr><td style="padding: 2px 12px 2px 0;"><strong>${label}</strong></td><td>${escapeHtml(value)}</td></tr>`).join("")}
            </table>
            <p style="font-size: 13px; color: #4b5563;">Responder este e-mail responde ao usuário.</p>
        </div>`;

    return { subject, text, html };
}

// Saves the report. Returns "TOO_MANY" over the limit. The email is sent later by sendEmail(), after the response.
const create = async (login: string, input: FeedbackInput) => {
    const user = await userModel.getByLogin(login);
    if (!user) throw new Error("User not found!");

    const since = new Date(Date.now() - 3_600_000);
    if (await feedbackModel.countByUserSince(user.id, since) >= MAX_PER_HOUR) return { status: "TOO_MANY" as const };

    const saved = await feedbackModel.create({ userId: user.id, ...input });

    return { status: "OK" as const, id: saved.id, createdAt: saved.createdAt, user };
}

// Emails a saved report to FEEDBACK_EMAIL. Without the setting it stays only in the database.
const sendEmail = async (id: string, createdAt: Date, input: FeedbackInput, user: Sender) => {
    if (!isFeedbackEmailEnabled()) return console.log("[feedback]: FEEDBACK_EMAIL or email settings missing; report only saved");

    const sent = await emailService.sendEmail({
        to: emailConfig.feedbackTo,
        ...buildEmail(id, input, user, createdAt),
        ...(user.email ? { replyTo: user.email } : {})
    });

    if (sent) await feedbackModel.markEmailed(id, new Date());
    else console.error(`[feedback]: report ${id} saved but not emailed`);
}

export default { create, sendEmail };
