-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "identityVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "stripeIdentitySessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeIdentitySessionId_key" ON "users"("stripeIdentitySessionId");

