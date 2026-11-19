-- Email change in Settings > Perfil: the new email waits here until its link is opened. Only adds an empty column.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingEmail" TEXT;

