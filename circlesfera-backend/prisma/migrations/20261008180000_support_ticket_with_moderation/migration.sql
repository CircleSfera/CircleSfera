-- A support ticket can be handed to moderation: it gets a state of its own
-- and points at the report created for it in the trust queues.
-- Additive: no existing ticket changes.

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'ESCALATED';

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "escalatedReportId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_escalatedReportId_key" ON "support_tickets"("escalatedReportId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_escalatedReportId_fkey" FOREIGN KEY ("escalatedReportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
