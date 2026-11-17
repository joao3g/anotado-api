-- Family roles. New users who join a family are MEMBER; whoever creates a family is ADMIN.

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "GroupRole" NOT NULL DEFAULT 'MEMBER';

-- Everyone already in a family becomes ADMIN, so no existing family is left without an admin.
-- Users without a family keep MEMBER (the role only matters inside a family).
UPDATE "User" SET "role" = 'ADMIN' WHERE "groupId" IS NOT NULL;
