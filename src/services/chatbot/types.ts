import { BotChannelName } from '../../models/bot.model.js';

// A choice shown as a button. id: at most 64 bytes (Telegram's callback_data limit).
export type Choice = { id: string, title: string };

// What the conversation needs from a messaging app. Texts use *bold* (WhatsApp style); each channel renders it.
export interface ChatChannel {
    name: BotChannelName,
    label: string, // "WhatsApp" | "Telegram", for texts
    idPrefix: string, // "wa" | "tg": stored ids and senders carry it, so the two apps never mix
    commandPrefix: string, // "" on WhatsApp ("resumo"), "/" on Telegram ("/resumo")
    maxListChoices: number, // WhatsApp lists hold 10 rows; Telegram keyboards hold many more
    sendText(to: string, text: string): Promise<void>,
    sendButtons(to: string, text: string, choices: Choice[]): Promise<void>, // up to 3
    sendList(to: string, text: string, buttonText: string, choices: Choice[]): Promise<void>
}

// A message already parsed by its channel. id and from without the channel prefix.
export type IncomingMessage =
    | { id: string, from: string, kind: "text", text: string }
    | { id: string, from: string, kind: "reply", replyId: string }
    | { id: string, from: string, kind: "other" };
