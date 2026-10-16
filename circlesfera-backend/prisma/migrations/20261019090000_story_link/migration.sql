-- Link stickers on stories, and the domains staff keep them from pointing
-- to. Adds a sticker kind, two staff actions and one table.

-- AlterEnum
ALTER TYPE "StoryStickerKind" ADD VALUE 'LINK';

-- AlterEnum
ALTER TYPE "AdminAction" ADD VALUE 'LINK_DOMAIN_BLOCKED';
ALTER TYPE "AdminAction" ADD VALUE 'LINK_DOMAIN_UNBLOCKED';

-- CreateTable
CREATE TABLE "blocked_link_domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_link_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blocked_link_domains_domain_key" ON "blocked_link_domains"("domain");

-- AddForeignKey
ALTER TABLE "blocked_link_domains" ADD CONSTRAINT "blocked_link_domains_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
