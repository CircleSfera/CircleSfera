-- CreateEnum
CREATE TYPE "AppealTargetType" AS ENUM ('ACCOUNT_BAN', 'POST_REMOVAL');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "payout_requests" DROP CONSTRAINT "payout_requests_userId_fkey";

-- DropTable
DROP TABLE "payout_requests";

-- DropEnum
DROP TYPE "PayoutStatus";

-- CreateTable
CREATE TABLE "profile_embeddings" (
    "profileId" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,

    CONSTRAINT "profile_embeddings_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "AppealTargetType" NOT NULL,
    "targetId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appeals_userId_idx" ON "appeals"("userId");

-- CreateIndex
CREATE INDEX "appeals_status_idx" ON "appeals"("status");

-- AddForeignKey
ALTER TABLE "profile_embeddings" ADD CONSTRAINT "profile_embeddings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

