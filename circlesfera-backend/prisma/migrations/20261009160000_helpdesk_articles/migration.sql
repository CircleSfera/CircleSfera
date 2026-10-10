-- Help Desk: the articles of the help centre. One article, one text per
-- language.
CREATE TYPE "HelpdeskArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

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

CREATE UNIQUE INDEX "helpdesk_articles_organizationId_slug_key" ON "helpdesk_articles"("organizationId", "slug");
CREATE INDEX "helpdesk_articles_organizationId_status_topic_position_idx" ON "helpdesk_articles"("organizationId", "status", "topic", "position");

ALTER TABLE "helpdesk_articles"
  ADD CONSTRAINT "helpdesk_articles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "helpdesk_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "helpdesk_article_texts" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "helpdesk_article_texts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "helpdesk_article_texts_articleId_locale_key" ON "helpdesk_article_texts"("articleId", "locale");

ALTER TABLE "helpdesk_article_texts"
  ADD CONSTRAINT "helpdesk_article_texts_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "helpdesk_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
