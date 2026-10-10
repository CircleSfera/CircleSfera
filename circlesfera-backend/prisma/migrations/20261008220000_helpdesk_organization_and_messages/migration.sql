-- Help Desk: organizations, messages, and the organization and reference
-- number of a ticket. Additive; nothing reads the new records yet.

CREATE TABLE "helpdesk_organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locales" TEXT[],
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_organizations_slug_key" ON "helpdesk_organizations"("slug");

-- The one organization of today, with the id the host module returns.
INSERT INTO "helpdesk_organizations" ("id", "slug", "name", "locales", "updatedAt")
VALUES ('7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0', 'circlesfera', 'CircleSfera', ARRAY['en', 'es'], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TYPE "HelpdeskAuthorKind" AS ENUM ('REQUESTER', 'AGENT', 'SYSTEM');
CREATE TYPE "HelpdeskMessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');
CREATE TYPE "HelpdeskMessageChannel" AS ENUM ('PRODUCT', 'EMAIL');

CREATE TABLE "helpdesk_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorKind" "HelpdeskAuthorKind" NOT NULL,
    "authorRef" TEXT,
    "visibility" "HelpdeskMessageVisibility" NOT NULL DEFAULT 'PUBLIC',
    "body" TEXT NOT NULL,
    "channel" "HelpdeskMessageChannel" NOT NULL DEFAULT 'PRODUCT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpdesk_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "helpdesk_messages_ticketId_createdAt_idx" ON "helpdesk_messages"("ticketId", "createdAt");

ALTER TABLE "helpdesk_messages"
  ADD CONSTRAINT "helpdesk_messages_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization of a ticket: every existing ticket is CircleSfera's. The
-- column stays nullable so the version of the code that is still running
-- during the deploy can keep opening tickets.
ALTER TABLE "support_tickets" ADD COLUMN "organizationId" TEXT;

UPDATE "support_tickets"
SET "organizationId" = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0'
WHERE "organizationId" IS NULL;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "support_tickets_organizationId_status_createdAt_idx" ON "support_tickets"("organizationId", "status", "createdAt");

-- Reference number: 1 for the oldest ticket, in order of opening; the
-- database gives the next one to every new ticket.
CREATE SEQUENCE "support_tickets_reference_seq" AS INTEGER;

ALTER TABLE "support_tickets" ADD COLUMN "reference" INTEGER;

UPDATE "support_tickets" AS t
SET "reference" = numbered.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS n
  FROM "support_tickets"
) AS numbered
WHERE t."id" = numbered."id";

SELECT setval(
  '"support_tickets_reference_seq"',
  COALESCE((SELECT MAX("reference") FROM "support_tickets"), 0) + 1,
  false
);

ALTER TABLE "support_tickets"
  ALTER COLUMN "reference" SET DEFAULT nextval('"support_tickets_reference_seq"');
ALTER TABLE "support_tickets" ALTER COLUMN "reference" SET NOT NULL;
ALTER SEQUENCE "support_tickets_reference_seq" OWNED BY "support_tickets"."reference";

CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");
