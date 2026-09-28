-- Comment edited flag (PD-004). Tracks whether a comment's content has been
-- edited by its author. Additive, default false.
ALTER TABLE "comments" ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false;
