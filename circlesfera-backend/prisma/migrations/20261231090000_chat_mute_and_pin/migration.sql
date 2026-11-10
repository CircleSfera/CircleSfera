-- Each member of a chat can mute it (no push until a time) and pin it at the
-- top of their inbox. Both are empty on every existing row.
ALTER TABLE "participants" ADD COLUMN "mutedUntil" TIMESTAMP(3);
ALTER TABLE "participants" ADD COLUMN "pinnedAt" TIMESTAMP(3);
