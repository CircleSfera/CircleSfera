-- Two report reasons: self-harm, and intellectual property.
ALTER TYPE "ReportReason" ADD VALUE 'SELF_HARM' BEFORE 'OTHER';
ALTER TYPE "ReportReason" ADD VALUE 'INTELLECTUAL_PROPERTY' BEFORE 'OTHER';

-- A report of self-harm is seen first in the staff queue.
ALTER TABLE "reports" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "reports_status_urgent_createdAt_idx" ON "reports"("status", "urgent", "createdAt");
