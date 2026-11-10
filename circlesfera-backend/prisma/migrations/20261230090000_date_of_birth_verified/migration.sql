-- Whether a person's date of birth was read from the document an identity
-- check verified. A constant default adds the column without rewriting the
-- table; every existing row is false until the person verifies again.
ALTER TABLE "users" ADD COLUMN "dateOfBirthVerified" BOOLEAN NOT NULL DEFAULT false;
