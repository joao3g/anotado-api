-- Family invite code: new users join a family with it.
-- 1) Add as nullable, 2) give every existing family a random code, 3) make it required and unique.
ALTER TABLE "Group" ADD COLUMN     "inviteCode" TEXT;

-- 8 chars from an alphabet without 0/O/1/I. The subquery refers to "Group"."id",
-- so it runs once per row (each family gets its own code).
UPDATE "Group" SET "inviteCode" = (
    SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    FROM generate_series(1, 8)
    WHERE "Group"."id" IS NOT NULL
);

ALTER TABLE "Group" ALTER COLUMN "inviteCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Group_inviteCode_key" ON "Group"("inviteCode");

-- Same format the API generates (Prisma does not model CHECK constraints, so they live only here).
ALTER TABLE "Group" ADD CONSTRAINT "Group_inviteCode_format" CHECK ("inviteCode" ~ '^[A-HJ-NP-Z2-9]{8}$');

-- Profile: phone (Brazil, digits only) and photo (JPEG data URL resized by the browser).
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "phone" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10,11}$');
ALTER TABLE "User" ADD CONSTRAINT "User_avatar_format" CHECK ("avatar" IS NULL OR ("avatar" LIKE 'data:image/jpeg;base64,%' AND length("avatar") <= 90000));
