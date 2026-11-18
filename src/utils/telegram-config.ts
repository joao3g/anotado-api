// Telegram Bot API settings. All optional: without them the Telegram bot is simply off. Never print these values.
const env = process.env;

const webhookSecret = env["TELEGRAM_WEBHOOK_SECRET"] ?? "";

export const telegramConfig = {
    token: env["TELEGRAM_BOT_TOKEN"] ?? "", // From @BotFather. Full control of the bot: never log it (it is part of API URLs)
    webhookSecret, // Telegram sends it back in X-Telegram-Bot-Api-Secret-Token on every webhook call
    username: (env["TELEGRAM_BOT_USERNAME"] ?? "").replace(/^@/, ""), // For t.me links, e.g. "ExpenseTrackerFamiliaBot"
    apiBaseUrl: env["TELEGRAM_API_BASE_URL"] ?? "https://api.telegram.org",
    // Public address of this API. Render sets RENDER_EXTERNAL_URL by itself.
    publicUrl: (env["TELEGRAM_WEBHOOK_BASE_URL"] ?? env["RENDER_EXTERNAL_URL"] ?? "").replace(/\/+$/, "")
};

// Telegram only accepts 1-256 chars of A-Z, a-z, 0-9, _ and - as the secret token.
export const isTelegramEnabled = () =>
    Boolean(telegramConfig.token && telegramConfig.username && /^[A-Za-z0-9_-]{16,256}$/.test(webhookSecret));
