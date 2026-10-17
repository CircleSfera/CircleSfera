-- Push by group, per Profile: likes; comments and mentions; new followers
-- and requests; messages; live broadcasts. Every group starts on, as push
-- was before.
ALTER TABLE "profiles" ADD COLUMN "pushLikes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "pushComments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "pushFollows" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "pushMessages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "pushLive" BOOLEAN NOT NULL DEFAULT true;
