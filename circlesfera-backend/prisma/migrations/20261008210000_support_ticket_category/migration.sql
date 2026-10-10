-- What a support ticket is about, chosen by who writes it. Existing tickets
-- are filed under OTHER.
CREATE TYPE "TicketCategory" AS ENUM ('ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER');

ALTER TABLE "support_tickets"
  ADD COLUMN "category" "TicketCategory" NOT NULL DEFAULT 'OTHER';
