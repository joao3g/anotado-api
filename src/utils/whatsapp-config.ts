// WhatsApp Cloud API settings. All optional: without them the bot is simply off (the app keeps working).
// Never print these values.
const env = process.env;

export const whatsappConfig = {
    token: env["WHATSAPP_TOKEN"] ?? "", // Permanent System User token
    phoneNumberId: env["WHATSAPP_PHONE_NUMBER_ID"] ?? "",
    appSecret: env["WHATSAPP_APP_SECRET"] ?? "", // Checks Meta's X-Hub-Signature-256 on every webhook call
    verifyToken: env["WHATSAPP_VERIFY_TOKEN"] ?? "", // Any random string, also typed in the Meta dashboard
    displayNumber: (env["WHATSAPP_DISPLAY_NUMBER"] ?? "").replace(/\D/g, ""), // Bot number for the wa.me link, e.g. 5511999999999
    // Graph API versions expire about 2 years after release: update the version here when Meta warns about it.
    apiBaseUrl: env["WHATSAPP_API_BASE_URL"] ?? "https://graph.facebook.com/v23.0"
};

export const isWhatsappEnabled = () =>
    Boolean(whatsappConfig.token && whatsappConfig.phoneNumberId && whatsappConfig.appSecret && whatsappConfig.verifyToken);
