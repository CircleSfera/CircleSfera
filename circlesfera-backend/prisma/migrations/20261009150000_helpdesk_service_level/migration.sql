-- Help Desk: what a ticket is measured by. Its service level, when its
-- first response and its resolution are due, and when its clock stopped.
CREATE TYPE "HelpdeskServiceLevel" AS ENUM ('STANDARD', 'PRIORITY');
CREATE TYPE "HelpdeskRatingScore" AS ENUM ('GOOD', 'BAD');

ALTER TABLE "support_tickets"
  ADD COLUMN "serviceLevel" "HelpdeskServiceLevel" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "firstResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "firstRespondedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionDueAt" TIMESTAMP(3),
  ADD COLUMN "pausedAt" TIMESTAMP(3);

CREATE INDEX "support_tickets_organizationId_status_resolutionDueAt_idx" ON "support_tickets"("organizationId", "status", "resolutionDueAt");

-- The targets of an organization, per service level, in minutes.
CREATE TABLE "helpdesk_service_targets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceLevel" "HelpdeskServiceLevel" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_service_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_service_targets_organizationId_serviceLevel_key" ON "helpdesk_service_targets"("organizationId", "serviceLevel");

ALTER TABLE "helpdesk_service_targets"
  ADD CONSTRAINT "helpdesk_service_targets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What the requester thought of the answer: one per ticket.
CREATE TABLE "helpdesk_ratings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "score" "HelpdeskRatingScore" NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_ratings_ticketId_key" ON "helpdesk_ratings"("ticketId");
CREATE INDEX "helpdesk_ratings_organizationId_createdAt_idx" ON "helpdesk_ratings"("organizationId", "createdAt");

ALTER TABLE "helpdesk_ratings"
  ADD CONSTRAINT "helpdesk_ratings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "helpdesk_ratings"
  ADD CONSTRAINT "helpdesk_ratings_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CircleSfera's targets: first response in 24 hours, or in 4 for a
-- requester on a paid plan; resolution in 72 hours for both.
INSERT INTO "helpdesk_service_targets" ("id", "organizationId", "serviceLevel", "firstResponseMinutes", "resolutionMinutes", "updatedAt") VALUES
  ('hst_circlesfera_standard', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'STANDARD', 1440, 4320, CURRENT_TIMESTAMP),
  ('hst_circlesfera_priority', '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'PRIORITY', 240, 4320, CURRENT_TIMESTAMP)
ON CONFLICT ("organizationId", "serviceLevel") DO NOTHING;
