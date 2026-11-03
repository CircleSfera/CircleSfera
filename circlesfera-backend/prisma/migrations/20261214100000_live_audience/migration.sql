-- Who a live is for. Every live until now was for everyone, which is the
-- default; nothing else changes.
CREATE TYPE "LiveAudience" AS ENUM ('EVERYONE', 'CLOSE_FRIENDS', 'PRACTICE');

ALTER TABLE "live_streams" ADD COLUMN "audience" "LiveAudience" NOT NULL DEFAULT 'EVERYONE';
