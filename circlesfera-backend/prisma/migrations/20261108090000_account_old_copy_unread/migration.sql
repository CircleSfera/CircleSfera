-- The account's old copy of the two-step flag loses its default, so a new
-- account is written without it: the app then names none of the old
-- credential columns of the account, and a later change can drop them
-- while this version still works if a deploy rolls back to it.
ALTER TABLE "users" ALTER COLUMN "isTwoFactorEnabled" DROP NOT NULL,
ALTER COLUMN "isTwoFactorEnabled" DROP DEFAULT;
