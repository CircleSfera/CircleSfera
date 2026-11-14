-- The columns of the former sale of content and of the monetization
-- programme keep their database defaults: the application no longer names
-- them (the schema marks the defaults as the database's own, so the client
-- writes nothing), new rows are still filled by the database, and the
-- previous image, which reads them as required, keeps working on a rollback.
-- The release that drops them can roll back to this one.

-- A promotion refund named the person refunded as its receiver, a column
-- the next release drops. The person is now its sender, as on the payment
-- it refunds; refunds recorded before keep their person the same way.
-- Touching updatedAt sends them to the analytics warehouse again.
UPDATE "transactions"
SET "senderId" = "receiverId", "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'PROMOTION_PAYMENT'
  AND "senderId" IS NULL
  AND "receiverId" IS NOT NULL;

-- The tables of the former creator payments are emptied now and dropped in
-- the next release: nothing is left that the data export no longer lists or
-- that an erasure could leave behind. Production holds three payout rows
-- (booleans and dates, one naming a connected account already closed) and
-- nothing in the others.
DELETE FROM "live_gifts";
DELETE FROM "tip_reservations";
DELETE FROM "post_unlocks";
DELETE FROM "story_unlocks";
DELETE FROM "message_unlocks";
DELETE FROM "stripe_payout_logs";
DELETE FROM "monetization";
