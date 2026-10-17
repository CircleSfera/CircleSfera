-- When each appealable decision was taken: an appeal is accepted for six
-- months from then.
ALTER TABLE "posts" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN "sanctionedAt" TIMESTAMP(3);
ALTER TABLE "promotions" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Decisions already in force have no recorded time: the last change of the
-- row is used, which is never earlier than the decision, so nobody loses
-- time to appeal. A decision already appealed keeps no recorded time, so
-- that appeal still counts as its one appeal.
UPDATE "posts" p SET "moderatedAt" = p."updatedAt"
  WHERE p."moderationStatus" IN ('HIDDEN', 'REMOVED')
    AND NOT EXISTS (
      SELECT 1 FROM "appeals" a
      WHERE a."targetType" = 'POST_REMOVAL' AND a."targetId" = p."id"
    );
UPDATE "profiles" p SET "sanctionedAt" = p."updatedAt"
  WHERE (p."isAccountBanned" = true OR p."suspendedUntil" IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM "appeals" a
      WHERE a."targetType" = 'ACCOUNT_BAN'
        AND (
          a."targetId" = p."id"
          OR (a."targetId" IS NULL AND a."userId" = p."userId")
        )
    );
UPDATE "promotions" p SET "reviewedAt" = p."updatedAt"
  WHERE p."status" = 'REJECTED'
    AND NOT EXISTS (
      SELECT 1 FROM "appeals" a
      WHERE a."targetType" = 'PROMOTION_REJECTION' AND a."targetId" = p."id"
    );
