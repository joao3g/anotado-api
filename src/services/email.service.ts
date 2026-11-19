import { emailConfig } from '../utils/email-config.js';

type Email = { to: string, subject: string, text: string, html: string };

// Sends one email with Resend's HTTP API (no library). Returns false on failure.
// Never logs the email body: it may hold a password reset link.
const sendEmail = async (email: Email) => {
    try {
        const response = await fetch(`${emailConfig.resendApiUrl}/emails`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${emailConfig.resendApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ from: emailConfig.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
            signal: AbortSignal.timeout(10_000)
        });

        if (!response.ok) {
            console.error(`[sendEmail]: Resend answered ${response.status}`, (await response.text()).slice(0, 300));
            return false;
        }

        return true;
    } catch (error) {
        console.error("[sendEmail]: ", error);
        return false;
    }
}

export default { sendEmail };
