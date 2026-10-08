-- Whether the payment provider has verified the payout account as a company.
-- Additive: false for every existing row, and set the next time the provider
-- reports on the account.

-- AlterTable
ALTER TABLE "monetization" ADD COLUMN     "verifiedCompany" BOOLEAN NOT NULL DEFAULT false;
