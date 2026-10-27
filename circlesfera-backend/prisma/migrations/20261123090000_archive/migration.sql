-- A post or frame its author archives is shown in their archive only, with
-- its likes and comments, until they show it on their profile again. Each
-- Profile also chooses whether its stories are kept in the archive when
-- their 24 hours end (on unless turned off), and keeps when it was turned
-- off. Adding a column with no default, or with a constant one, only changes
-- the catalogue: the tables are not rewritten. The indexes come next, each
-- built without blocking writes.
ALTER TABLE "posts" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN "saveStoriesToArchive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "storyArchiveOffAt" TIMESTAMP(3);
