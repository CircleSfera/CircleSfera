-- A notification row can group likes of one post (or comment likes on it)
-- or new followers: who came before the latest sender, and how many besides
-- the latest. Both new columns are empty or 0 on every existing row.
ALTER TABLE "notifications" ADD COLUMN "othersCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN "previousSenderId" TEXT;

-- NOT VALID: the column is new and empty, so there is nothing to check;
-- the next migration validates it without blocking writes.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_previousSenderId_fkey" FOREIGN KEY ("previousSenderId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
