-- Test Accounts (PD-006): account-level mark for accounts that exist in
-- production but are isolated from real participants. Additive; every existing
-- account stays a real account.
ALTER TABLE "users" ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_isTestAccount_idx" ON "users"("isTestAccount");
