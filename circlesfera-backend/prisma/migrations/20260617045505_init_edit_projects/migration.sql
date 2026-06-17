-- CreateTable
CREATE TABLE "edit_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'image',
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edit_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_projects_userId_updatedAt_idx" ON "edit_projects"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "edit_projects" ADD CONSTRAINT "edit_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
