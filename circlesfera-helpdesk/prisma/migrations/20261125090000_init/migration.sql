-- The Help Desk's own database, step 1 of ADR-0034: the Help Desk tables of
-- circlesfera-backend, with the same names, and no reference to a table of
-- CircleSfera. Nothing is copied into them yet.

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED', 'ESCALATED', 'WAITING');

-- CreateEnum
CREATE TYPE "HelpdeskAuthorKind" AS ENUM ('REQUESTER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "HelpdeskMessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "HelpdeskMessageChannel" AS ENUM ('PRODUCT', 'EMAIL');

-- CreateEnum
CREATE TYPE "HelpdeskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "HelpdeskArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "HelpdeskServiceLevel" AS ENUM ('STANDARD', 'PRIORITY');

-- CreateEnum
CREATE TYPE "HelpdeskRatingScore" AS ENUM ('GOOD', 'BAD');

-- CreateEnum
CREATE TYPE "HelpdeskInboundOutcome" AS ENUM ('RECEIVED', 'MATCHED', 'NO_TICKET', 'SENDER_MISMATCH', 'EMPTY', 'AUTOMATED', 'SPAM');

-- CreateEnum
CREATE TYPE "HelpdeskEventKind" AS ENUM ('STATE', 'TOPIC', 'PRIORITY', 'ASSIGNMENT', 'HANDOVER');

-- CreateTable
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

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "reply" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" SERIAL NOT NULL,
    "priority" "HelpdeskPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedAgentRef" TEXT,
    "waitingRemindedAt" TIMESTAMP(3),
    "previousTicketId" TEXT,
    "serviceLevel" "HelpdeskServiceLevel" NOT NULL DEFAULT 'STANDARD',
    "firstResponseDueAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "escalatedReportId" TEXT,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "helpdesk_saved_replies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "ownerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_saved_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "helpdesk_articles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "topic" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "status" "HelpdeskArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "usefulYes" INTEGER NOT NULL DEFAULT 0,
    "usefulNo" INTEGER NOT NULL DEFAULT 0,
    "authorRef" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_article_texts" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_article_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_organizations_slug_key" ON "helpdesk_organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_escalatedReportId_key" ON "support_tickets"("escalatedReportId");

-- CreateIndex
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets"("userId");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_resolvedAt_idx" ON "support_tickets"("resolvedAt");

-- CreateIndex
CREATE INDEX "support_tickets_organizationId_status_createdAt_idx" ON "support_tickets"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_previousTicketId_idx" ON "support_tickets"("previousTicketId");

-- CreateIndex
CREATE INDEX "support_tickets_organizationId_assignedAgentRef_status_idx" ON "support_tickets"("organizationId", "assignedAgentRef", "status");

-- CreateIndex
CREATE INDEX "support_tickets_organizationId_status_resolutionDueAt_idx" ON "support_tickets"("organizationId", "status", "resolutionDueAt");

-- CreateIndex
CREATE INDEX "helpdesk_messages_ticketId_createdAt_idx" ON "helpdesk_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "helpdesk_ticket_events_ticketId_createdAt_idx" ON "helpdesk_ticket_events"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_ratings_ticketId_key" ON "helpdesk_ratings"("ticketId");

-- CreateIndex
CREATE INDEX "helpdesk_ratings_organizationId_createdAt_idx" ON "helpdesk_ratings"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "helpdesk_saved_replies_organizationId_ownerRef_idx" ON "helpdesk_saved_replies"("organizationId", "ownerRef");

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_service_targets_organizationId_serviceLevel_key" ON "helpdesk_service_targets"("organizationId", "serviceLevel");

-- CreateIndex
CREATE INDEX "helpdesk_articles_organizationId_status_topic_position_idx" ON "helpdesk_articles"("organizationId", "status", "topic", "position");

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_articles_organizationId_slug_key" ON "helpdesk_articles"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_article_texts_articleId_locale_key" ON "helpdesk_article_texts"("articleId", "locale");

-- CreateIndex
CREATE INDEX "helpdesk_inbound_emails_organizationId_outcome_receivedAt_idx" ON "helpdesk_inbound_emails"("organizationId", "outcome", "receivedAt");

-- CreateIndex
CREATE INDEX "helpdesk_inbound_emails_receivedAt_idx" ON "helpdesk_inbound_emails"("receivedAt");

-- CreateIndex
CREATE INDEX "helpdesk_inbound_emails_ticketId_idx" ON "helpdesk_inbound_emails"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "helpdesk_inbound_emails_organizationId_messageId_key" ON "helpdesk_inbound_emails"("organizationId", "messageId");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_previousTicketId_fkey" FOREIGN KEY ("previousTicketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ticket_events" ADD CONSTRAINT "helpdesk_ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ratings" ADD CONSTRAINT "helpdesk_ratings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ratings" ADD CONSTRAINT "helpdesk_ratings_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_saved_replies" ADD CONSTRAINT "helpdesk_saved_replies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_service_targets" ADD CONSTRAINT "helpdesk_service_targets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_articles" ADD CONSTRAINT "helpdesk_articles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_article_texts" ADD CONSTRAINT "helpdesk_article_texts_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "helpdesk_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_inbound_emails" ADD CONSTRAINT "helpdesk_inbound_emails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_inbound_emails" ADD CONSTRAINT "helpdesk_inbound_emails_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
