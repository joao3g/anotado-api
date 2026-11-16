-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "recurrenceId" TEXT;

-- CreateTable
CREATE TABLE "Recurrence" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "isEssential" BOOLEAN,
    "startDate" TIMESTAMP(3) NOT NULL,
    "totalInstallments" INTEGER,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "canceledAt" TIMESTAMP(3),
    "categoryId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recurrence_groupId_idx" ON "Recurrence"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurrenceId_installmentNumber_key" ON "Expense"("recurrenceId", "installmentNumber");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

