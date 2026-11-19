// Email settings (Resend). All optional: without them no email is sent. Never print these values.
const env = process.env;

export const emailConfig = {
    resendApiKey: env["RESEND_API_KEY"] ?? "", // From the Resend dashboard. Never log it.
    from: env["EMAIL_FROM"] ?? "", // e.g. "Anotado <nao-responda@seudominio.com.br>". The domain must be verified in Resend.
    appUrl: (env["APP_URL"] ?? "").replace(/\/+$/, ""), // Frontend address, for links in emails
    resendApiUrl: (env["RESEND_API_URL"] ?? "https://api.resend.com").replace(/\/+$/, ""), // Changed only by local tests (fake server)
    feedbackTo: (env["FEEDBACK_EMAIL"] ?? "").trim() // Who receives "Reportar problema" emails. Empty = reports are only saved.
};

export const isEmailEnabled = () =>
    Boolean(emailConfig.resendApiKey && emailConfig.from && /^https?:\/\//.test(emailConfig.appUrl));

// Reports need no link in the email, so APP_URL is not required here.
export const isFeedbackEmailEnabled = () =>
    Boolean(emailConfig.resendApiKey && emailConfig.from && /^\S+@\S+\.\S+$/.test(emailConfig.feedbackTo));
