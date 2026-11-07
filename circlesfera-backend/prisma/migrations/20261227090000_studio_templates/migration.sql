-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "studio_templates" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "postId" TEXT,
    "name" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_template_uses" (
    "templateId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_template_uses_pkey" PRIMARY KEY ("templateId","profileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "studio_templates_postId_key" ON "studio_templates"("postId");

-- CreateIndex
CREATE INDEX "studio_templates_profileId_updatedAt_idx" ON "studio_templates"("profileId", "updatedAt");

-- CreateIndex
CREATE INDEX "studio_template_uses_profileId_idx" ON "studio_template_uses"("profileId");


-- AddForeignKey
-- NOT VALID: the column is new and empty, so there is nothing to check;
-- it skips the scan of "posts" under SHARE ROW EXCLUSIVE. Validated in the
-- next migration.
ALTER TABLE "posts" ADD CONSTRAINT "posts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "studio_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "studio_templates" ADD CONSTRAINT "studio_templates_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_templates" ADD CONSTRAINT "studio_templates_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_template_uses" ADD CONSTRAINT "studio_template_uses_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "studio_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_template_uses" ADD CONSTRAINT "studio_template_uses_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

