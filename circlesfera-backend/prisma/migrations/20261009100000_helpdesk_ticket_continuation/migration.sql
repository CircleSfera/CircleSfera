-- Help Desk: a ticket opened by replying to a closed one points to it.
ALTER TABLE "support_tickets" ADD COLUMN "previousTicketId" TEXT;

CREATE INDEX "support_tickets_previousTicketId_idx" ON "support_tickets"("previousTicketId");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_previousTicketId_fkey"
  FOREIGN KEY ("previousTicketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
