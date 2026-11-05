-- A message request with one of the recipient's hidden words goes to Hidden
-- requests. Only adds a column.
ALTER TABLE "participants" ADD COLUMN "requestHiddenByWords" BOOLEAN NOT NULL DEFAULT false;
