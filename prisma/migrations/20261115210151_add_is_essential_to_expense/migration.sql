-- isEssential exists in schema.prisma but no earlier migration created it.
-- IF NOT EXISTS: safe whether or not the column is already in the database.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "isEssential" BOOLEAN;
