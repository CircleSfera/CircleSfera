-- A post, frame or story its author deletes waits in their Recently deleted
-- for 30 days, shown to nobody else, and can be restored; then it is erased.
-- The row keeps when it was deleted. Adding a column with no default only
-- changes the catalogue: the tables are not rewritten. The indexes come next,
-- each built without blocking writes.
ALTER TABLE "posts" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "stories" ADD COLUMN "deletedAt" TIMESTAMP(3);
