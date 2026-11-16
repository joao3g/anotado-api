-- The "essential expense" flag was removed from the app. This permanently deletes its stored values.
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "isEssential";

-- AlterTable
ALTER TABLE "Recurrence" DROP COLUMN "isEssential";
