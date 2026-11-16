-- AlterTable
-- Existing cards get the app's main green. Hex WITHOUT "#", same format as Category.color.
ALTER TABLE "Card" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '009A4D';

-- Exactly 6 hex chars (Prisma does not model CHECK constraints, so it lives only here).
ALTER TABLE "Card" ADD CONSTRAINT "Card_color_format" CHECK ("color" ~ '^[0-9A-Fa-f]{6}$');
