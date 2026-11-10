-- Who may mention, tag or message a Profile, and tags waiting for approval.
-- Only adds: two enums, four Profile columns and a tag status, each with a
-- default that keeps today's behaviour (everyone, shown, requests on).
CREATE TYPE "InteractionAudience" AS ENUM ('EVERYONE', 'FOLLOWING', 'NOBODY');

CREATE TYPE "PostTagStatus" AS ENUM ('SHOWN', 'PENDING');

ALTER TABLE "post_tags" ADD COLUMN "status" "PostTagStatus" NOT NULL DEFAULT 'SHOWN';

ALTER TABLE "profiles" ADD COLUMN "manualTagApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mentionsFrom" "InteractionAudience" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN "messageRequests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tagsFrom" "InteractionAudience" NOT NULL DEFAULT 'EVERYONE';
