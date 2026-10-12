-- A line a staff member leaves on an account for the rest of the staff.
-- Only adds a table: nothing that exists changes.

-- CreateTable
CREATE TABLE "staff_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_notes_userId_createdAt_idx" ON "staff_notes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_notes" ADD CONSTRAINT "staff_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "admin_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
