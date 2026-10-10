-- Help Desk: emails that arrived at a reply address, kept for 30 days.
CREATE TYPE "HelpdeskInboundOutcome" AS ENUM ('RECEIVED', 'MATCHED', 'NO_TICKET', 'SENDER_MISMATCH', 'EMPTY', 'AUTOMATED', 'SPAM');

CREATE TABLE "helpdesk_inbound_emails" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "spamScore" DOUBLE PRECISION,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "HelpdeskInboundOutcome" NOT NULL DEFAULT 'RECEIVED',
    "ticketId" TEXT,
    "noticeSentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_inbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_inbound_emails_organizationId_messageId_key" ON "helpdesk_inbound_emails"("organizationId", "messageId");
CREATE INDEX "helpdesk_inbound_emails_organizationId_outcome_receivedAt_idx" ON "helpdesk_inbound_emails"("organizationId", "outcome", "receivedAt");
CREATE INDEX "helpdesk_inbound_emails_receivedAt_idx" ON "helpdesk_inbound_emails"("receivedAt");
CREATE INDEX "helpdesk_inbound_emails_ticketId_idx" ON "helpdesk_inbound_emails"("ticketId");

ALTER TABLE "helpdesk_inbound_emails"
  ADD CONSTRAINT "helpdesk_inbound_emails_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "helpdesk_inbound_emails"
  ADD CONSTRAINT "helpdesk_inbound_emails_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
