-- When each appealable decision was taken: an appeal is accepted for six
-- months from then.
ALTER TABLE "posts" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN "sanctionedAt" TIMESTAMP(3);
ALTER TABLE "promotions" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Decisions already in force have no recorded time: the last change of the
-- row is used, which is never earlier than the decision, so nobody loses
-- time to appeal.
UPDATE "posts" SET "moderatedAt" = "updatedAt"
  WHERE "moderationStatus" IN ('HIDDEN', 'REMOVED');
UPDATE "profiles" SET "sanctionedAt" = "updatedAt"
  WHERE "isAccountBanned" = true OR "suspendedUntil" IS NOT NULL;
UPDATE "promotions" SET "reviewedAt" = "updatedAt"
  WHERE "status" = 'REJECTED';
