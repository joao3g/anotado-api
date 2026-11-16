-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Recurrence" DROP CONSTRAINT "Recurrence_categoryId_fkey";

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "categoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Recurrence" ALTER COLUMN "categoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
