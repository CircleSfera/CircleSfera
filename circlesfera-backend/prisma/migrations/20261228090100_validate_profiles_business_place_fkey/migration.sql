-- Validates the foreign key added NOT VALID in the previous migration; it
-- takes only SHARE UPDATE EXCLUSIVE, so writes to "profiles" go on.
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_businessPlaceId_fkey";
