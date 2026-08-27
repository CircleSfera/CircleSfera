-- Remove orphan friendId rows before adding FK (friendId must reference profiles.id)
DELETE FROM "close_friends" AS cf
WHERE NOT EXISTS (
  SELECT 1 FROM "profiles" AS p WHERE p."id" = cf."friendId"
);

-- Add FK + reverse lookup index
CREATE INDEX IF NOT EXISTS "close_friends_friendId_idx" ON "close_friends"("friendId");

ALTER TABLE "close_friends"
  ADD CONSTRAINT "close_friends_friendId_fkey"
  FOREIGN KEY ("friendId") REFERENCES "profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
