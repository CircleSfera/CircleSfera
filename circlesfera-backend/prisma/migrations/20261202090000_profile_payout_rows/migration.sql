-- A Profile that opens a payout account of its own gets a row that names
-- only the Profile. The person's row keeps its person.
ALTER TABLE "monetization" ALTER COLUMN "userId" DROP NOT NULL;
