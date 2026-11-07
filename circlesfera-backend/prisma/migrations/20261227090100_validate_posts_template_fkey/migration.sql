-- Validates the foreign key added NOT VALID in the previous migration; it
-- takes only SHARE UPDATE EXCLUSIVE, so writes to "posts" go on.
ALTER TABLE "posts" VALIDATE CONSTRAINT "posts_templateId_fkey";
