-- Content removed by moderation is kept, hidden from everyone, for the six
-- months its author has to appeal, then erased. Stories and comments record
-- when they were hidden or removed, as posts already do. Adding a column
-- with no default only changes the catalogue: the tables are not rewritten.
-- The indexes come next, each built without blocking writes, and the times
-- of the decisions already in force are filled in after them.
ALTER TABLE "stories" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "comments" ADD COLUMN "moderatedAt" TIMESTAMP(3);
