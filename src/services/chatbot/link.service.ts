// Account side of the message bots (Settings > Perfil > Bots de mensagem): status, one-time link code, disconnect.
import { randomInt } from 'node:crypto';
import botModel, { BotChannelName } from '../../models/bot.model.js';
import userModel from '../../models/user.model.js';
import { whatsappConfig, isWhatsappEnabled } from '../../utils/whatsapp-config.js';
import { telegramConfig, isTelegramEnabled } from '../../utils/telegram-config.js';
import { hashLinkCode } from './conversation.service.js';

const LINK_CODE_MINUTES = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I

async function getUserId(login: string) {
    const user = await userModel.getByLogin(login);
    if (!user) throw new Error("User not found!");

    return user.id;
}

// The same code links WhatsApp or Telegram, whichever bot receives it first. Only its hash is stored.
const createLinkCode = async (login: string) => {
    const userId = await getUserId(login);

    const code = `ET-${Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;
    const expiresAt = new Date(Date.now() + LINK_CODE_MINUTES * 60_000);

    await botModel.saveLinkCode(userId, hashLinkCode(code), expiresAt);

    const whatsappMessage = `Conectar ${code}`;

    return {
        code,
        expiresAt,
        whatsapp: isWhatsappEnabled() ? {
            message: whatsappMessage,
            link: whatsappConfig.displayNumber ? `https://wa.me/${whatsappConfig.displayNumber}?text=${encodeURIComponent(whatsappMessage)}` : null
        } : null,
        // Telegram opens the bot and sends "/start <code>" when the user taps Start.
        telegram: isTelegramEnabled() ? { link: `https://t.me/${telegramConfig.username}?start=${code}` } : null
    };
}

const unlink = async (login: string, channel: BotChannelName) => {
    await botModel.unlink(await getUserId(login), channel);
}

// Never the full WhatsApp number or the Telegram id: only whether it is linked (and WhatsApp's last 4 digits).
const getStatus = async (login: string) => {
    const links = await botModel.getLinks(await getUserId(login));

    return {
        whatsapp: {
            enabled: isWhatsappEnabled(),
            connected: Boolean(links?.whatsappId),
            lastDigits: links?.whatsappId ? links.whatsappId.slice(-4) : null,
            botNumber: whatsappConfig.displayNumber || null
        },
        telegram: {
            enabled: isTelegramEnabled(),
            connected: Boolean(links?.telegramId),
            botUsername: telegramConfig.username || null
        }
    };
}

export default { createLinkCode, unlink, getStatus };
