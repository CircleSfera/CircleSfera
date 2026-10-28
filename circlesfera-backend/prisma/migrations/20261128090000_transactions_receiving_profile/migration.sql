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
