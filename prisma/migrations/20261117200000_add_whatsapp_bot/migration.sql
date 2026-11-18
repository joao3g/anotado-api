-- WhatsApp bot: linked WhatsApp id per user, one-time link codes, chat drafts, and received message ids.
-- Additive only: no existing data changes.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappId" TEXT;

-- CreateTable
CREATE TABLE "WhatsappLinkCode" (
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappLinkCode_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WhatsappDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "cardId" TEXT,
    "categoryId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappLinkCode_codeHash_key" ON "WhatsappLinkCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappDraft_userId_key" ON "WhatsappDraft"("userId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_waId_createdAt_idx" ON "WhatsappMessage"("waId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappId_key" ON "User"("whatsappId");

-- AddForeignKey
ALTER TABLE "WhatsappLinkCode" ADD CONSTRAINT "WhatsappLinkCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappDraft" ADD CONSTRAINT "WhatsappDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (Prisma does not model them, so they live only here).
-- wa_id: digits only with country code (E.164 without "+").
ALTER TABLE "User" ADD CONSTRAINT "User_whatsappId_format" CHECK ("whatsappId" IS NULL OR "whatsappId" ~ '^[0-9]{8,15}$');
-- Same money rule as Expense: always positive.
ALTER TABLE "WhatsappDraft" ADD CONSTRAINT "WhatsappDraft_amount_positive" CHECK ("amount" > 0);
