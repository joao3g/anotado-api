-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "cardId" TEXT;

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN     "cardId" TEXT;

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lastFourDigits" TEXT,
    "closingDay" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_groupId_idx" ON "Card"("groupId");

-- CreateIndex
CREATE INDEX "Expense_cardId_groupId_idx" ON "Expense"("cardId", "groupId");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: one default card per group that already has CREDIT expenses or recurrences.
-- Closing day 3 = the old hardcoded rule, so no dueDate changes. Saved dates are NOT touched here.
INSERT INTO "Card" ("id", "title", "lastFourDigits", "closingDay", "groupId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Cartão principal', NULL, 3, g."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Group" g
WHERE EXISTS (SELECT 1 FROM "Expense" e WHERE e."groupId" = g."id" AND e."paymentMethod" = 'CREDIT')
   OR EXISTS (SELECT 1 FROM "Recurrence" r WHERE r."groupId" = g."id" AND r."paymentMethod" = 'CREDIT');

-- Data: link existing CREDIT rows to their group's default card (each group has at most one card at this point).
UPDATE "Expense" e SET "cardId" = c."id"
FROM "Card" c
WHERE c."groupId" = e."groupId" AND e."paymentMethod" = 'CREDIT';

UPDATE "Recurrence" r SET "cardId" = c."id"
FROM "Card" c
WHERE c."groupId" = r."groupId" AND r."paymentMethod" = 'CREDIT';

-- Rules the database enforces (Prisma does not model CHECK constraints, so they live only here).
-- CREDIT <=> has a card.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_card_only_for_credit" CHECK (("paymentMethod" = 'CREDIT') = ("cardId" IS NOT NULL));
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_card_only_for_credit" CHECK (("paymentMethod" = 'CREDIT') = ("cardId" IS NOT NULL));

-- 1..27 so the invoice day (closingDay + 1) exists in every month and never jumps a month. Only 4 digits: a full card number can never be stored.
ALTER TABLE "Card" ADD CONSTRAINT "Card_closingDay_range" CHECK ("closingDay" BETWEEN 1 AND 27);
ALTER TABLE "Card" ADD CONSTRAINT "Card_lastFourDigits_format" CHECK ("lastFourDigits" IS NULL OR "lastFourDigits" ~ '^[0-9]{4}$');
