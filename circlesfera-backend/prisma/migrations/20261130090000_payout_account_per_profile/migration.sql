-- Each earning Profile will hold its own payout account. This step adds the
-- columns and fills them; the code writes both here and on the person until
-- the readers move here.
ALTER TABLE "monetization" ADD COLUMN "profileId" TEXT,
ADD COLUMN "stripeConnectAccountId" TEXT;

ALTER TABLE "stripe_payout_logs" ADD COLUMN "profileId" TEXT;

CREATE UNIQUE INDEX "monetization_profileId_key" ON "monetization"("profileId");

CREATE UNIQUE INDEX "monetization_stripeConnectAccountId_key" ON "monetization"("stripeConnectAccountId");

CREATE INDEX "stripe_payout_logs_profileId_idx" ON "stripe_payout_logs"("profileId");

ALTER TABLE "monetization" ADD CONSTRAINT "monetization_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stripe_payout_logs" ADD CONSTRAINT "stripe_payout_logs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The repair of the earlier step, run again: it changes only rows still
-- missing what it fills, so rows it already repaired are left as they are,
-- and rows written in between by an older image of the backend are repaired.
-- Each payment records the Profile that earned it, as tips already do. The
-- rows written before name it through what was paid for: the post, the
-- story, the paid message (its sender) or the broadcast (its host). Rows
-- whose post, story, message or broadcast is gone keep no Profile.
UPDATE "transactions" t
SET "receiverProfileId" = p."profileId"
FROM "posts" p
WHERE t."receiverProfileId" IS NULL
  AND t."type" = 'DIRECT_POST_UNLOCK'
  AND t."postId" = p."id";

UPDATE "transactions" t
SET "receiverProfileId" = s."profileId"
FROM "stories" s
WHERE t."receiverProfileId" IS NULL
  AND t."type" = 'DIRECT_STORY_UNLOCK'
  AND t."storyId" = s."id";

UPDATE "transactions" t
SET "receiverProfileId" = m."senderId"
FROM "messages" m
WHERE t."receiverProfileId" IS NULL
  AND t."type" = 'DIRECT_MESSAGE_UNLOCK'
  AND t."messageId" = m."id";

UPDATE "transactions" t
SET "receiverProfileId" = ls."hostId"
FROM "live_streams" ls
WHERE t."receiverProfileId" IS NULL
  AND t."type" = 'DIRECT_LIVE_GIFT'
  AND t."liveStreamId" = ls."id";

-- A live gift was recorded with no person as receiver and was never counted
-- in the host's earnings: the payment named the host's Profile where a
-- person was expected. The person is the gift's own receiver, set when the
-- gift was opened to the host's person and emptied only if they were erased.
-- The host's share of each completed gift is added to their earnings, as for
-- a gift paid from now on; a refunded one is not counted.
WITH repaired AS (
  UPDATE "transactions" t
  SET "receiverId" = g."receiverId"
  FROM "live_gifts" g
  WHERE t."receiverId" IS NULL
    AND t."type" = 'DIRECT_LIVE_GIFT'
    AND g."transactionId" = t."id"
    AND g."receiverId" IS NOT NULL
  RETURNING t."receiverId", t."amount", t."status"
)
INSERT INTO "monetization" ("id", "userId", "lifetimeEarningsCents", "updatedAt")
SELECT gen_random_uuid()::text, "receiverId", SUM(FLOOR("amount" * 0.8))::integer, CURRENT_TIMESTAMP
FROM repaired
WHERE "status" = 'COMPLETED'
GROUP BY "receiverId"
ON CONFLICT ("userId") DO UPDATE
SET "lifetimeEarningsCents" = "monetization"."lifetimeEarningsCents" + EXCLUDED."lifetimeEarningsCents",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Every person with a payout account has a row to hold it.
INSERT INTO "monetization" ("id", "userId", "updatedAt")
SELECT gen_random_uuid()::text, u."id", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."stripeConnectAccountId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "monetization" m WHERE m."userId" = u."id");

UPDATE "monetization" m
SET "stripeConnectAccountId" = u."stripeConnectAccountId"
FROM "users" u
WHERE m."userId" = u."id"
  AND m."stripeConnectAccountId" IS NULL
  AND u."stripeConnectAccountId" IS NOT NULL;

-- The person's account goes to their oldest Creator or Business Profile, or
-- to their oldest Profile when none earns.
UPDATE "monetization" m
SET "profileId" = (
  SELECT p."id"
  FROM "profiles" p
  WHERE p."userId" = m."userId"
  ORDER BY (p."accountType" = 'PERSONAL'), p."createdAt", p."id"
  LIMIT 1
)
WHERE m."profileId" IS NULL;

-- Each payout already recorded belongs to the Profile holding its account.
UPDATE "stripe_payout_logs" l
SET "profileId" = m."profileId"
FROM "monetization" m
WHERE l."userId" = m."userId"
  AND l."profileId" IS NULL
  AND m."profileId" IS NOT NULL;
