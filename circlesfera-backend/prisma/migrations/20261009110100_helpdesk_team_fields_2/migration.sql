-- Help Desk: priority and assignment of a ticket, the reminder of a wait,
-- and the events that record each change. Additive.
CREATE TYPE "HelpdeskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "HelpdeskEventKind" AS ENUM ('STATE', 'TOPIC', 'PRIORITY', 'ASSIGNMENT', 'HANDOVER');

ALTER TABLE "support_tickets"
  ADD COLUMN "priority" "HelpdeskPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "assignedAgentRef" TEXT,
  ADD COLUMN "waitingRemindedAt" TIMESTAMP(3);

CREATE INDEX "support_tickets_organizationId_assignedAgentRef_status_idx"
  ON "support_tickets"("organizationId", "assignedAgentRef", "status");

CREATE TABLE "helpdesk_ticket_events" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" "HelpdeskEventKind" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actorKind" "HelpdeskAuthorKind" NOT NULL,
    "actorRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "helpdesk_ticket_events_ticketId_createdAt_idx" ON "helpdesk_ticket_events"("ticketId", "createdAt");

ALTER TABLE "helpdesk_ticket_events"
  ADD CONSTRAINT "helpdesk_ticket_events_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
