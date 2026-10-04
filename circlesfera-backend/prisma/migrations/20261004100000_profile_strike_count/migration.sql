-- Moderation sanctions apply to the Profile that committed the infraction.
-- Additive: a per-Profile strike counter, starting at zero.
ALTER TABLE "profiles" ADD COLUMN "strikeCount" INTEGER NOT NULL DEFAULT 0;

-- Carry each account's existing strikes to its first Profile, so no strike is
-- lost. users."strikeCount" is kept unchanged.
UPDATE "profiles" AS p
SET "strikeCount" = u."strikeCount"
FROM "users" AS u
WHERE u."strikeCount" > 0
  AND p.id = (
    SELECT p2.id
    FROM "profiles" AS p2
    WHERE p2."userId" = u.id
    ORDER BY p2."createdAt" ASC, p2.id ASC
    LIMIT 1
  );
