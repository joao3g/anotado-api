-- Message bots: the WhatsApp tables become generic (shared by WhatsApp and Telegram), and users get a Telegram id.
-- Only RENAME and ADD: no row is deleted or changed.

-- WhatsappLinkCode -> BotLinkCode
ALTER TABLE "WhatsappLinkCode" RENAME TO "BotLinkCode";
ALTER TABLE "BotLinkCode" RENAME CONSTRAINT "WhatsappLinkCode_pkey" TO "BotLinkCode_pkey";
ALTER TABLE "BotLinkCode" RENAME CONSTRAINT "WhatsappLinkCode_userId_fkey" TO "BotLinkCode_userId_fkey";
ALTER INDEX "WhatsappLinkCode_codeHash_key" RENAME TO "BotLinkCode_codeHash_key";

-- WhatsappDraft -> BotDraft
ALTER TABLE "WhatsappDraft" RENAME TO "BotDraft";
ALTER TABLE "BotDraft" RENAME CONSTRAINT "WhatsappDraft_pkey" TO "BotDraft_pkey";
ALTER TABLE "BotDraft" RENAME CONSTRAINT "WhatsappDraft_userId_fkey" TO "BotDraft_userId_fkey";
ALTER TABLE "BotDraft" RENAME CONSTRAINT "WhatsappDraft_amount_positive" TO "BotDraft_amount_positive";
ALTER INDEX "WhatsappDraft_userId_key" RENAME TO "BotDraft_userId_key";

-- WhatsappMessage -> BotInboundMessage (waId -> senderId; new ids/senders carry the channel: "wa:..." / "tg:...")
ALTER TABLE "WhatsappMessage" RENAME TO "BotInboundMessage";
ALTER TABLE "BotInboundMessage" RENAME COLUMN "waId" TO "senderId";
ALTER TABLE "BotInboundMessage" RENAME CONSTRAINT "WhatsappMessage_pkey" TO "BotInboundMessage_pkey";
ALTER INDEX "WhatsappMessage_waId_createdAt_idx" RENAME TO "BotInboundMessage_senderId_createdAt_idx";

-- Telegram user id (digits only, unique)
ALTER TABLE "User" ADD COLUMN "telegramId" TEXT;
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
ALTER TABLE "User" ADD CONSTRAINT "User_telegramId_format" CHECK ("telegramId" IS NULL OR "telegramId" ~ '^[0-9]{1,20}$');
