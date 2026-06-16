-- AlterTable: Add missing stripeConnectAccountId column to users table.
-- This column exists in schema.prisma but was never included in a migration file.
ALTER TABLE "users" ADD COLUMN "stripeConnectAccountId" TEXT;

-- CreateIndex: Enforce the @unique constraint declared in schema.prisma
CREATE UNIQUE INDEX "users_stripeConnectAccountId_key" ON "users"("stripeConnectAccountId");
