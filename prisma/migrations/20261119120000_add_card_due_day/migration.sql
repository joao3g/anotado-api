-- Due day of the card's invoice (dia de vencimento).
-- Existing cards get closingDay + 1: that was the old rule, so no saved expense dueDate changes.
ALTER TABLE "Card" ADD COLUMN "dueDay" INTEGER;
UPDATE "Card" SET "dueDay" = "closingDay" + 1;
ALTER TABLE "Card" ALTER COLUMN "dueDay" SET NOT NULL;

-- 1..28 so the due day exists in every month. Prisma does not model CHECK constraints, so it lives only here.
ALTER TABLE "Card" ADD CONSTRAINT "Card_dueDay_range" CHECK ("dueDay" BETWEEN 1 AND 28);
