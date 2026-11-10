-- The monetization programme: a Profile charges only once staff approve its
-- application. Expand-only: a new enum, nullable columns and one with a
-- constant default, so no table is rewritten; every Profile starts at NONE.
CREATE TYPE "MonetizationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

ALTER TABLE "profiles" ADD COLUMN "monetizationStatus" "MonetizationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "monetizationAppliedAt" TIMESTAMP(3),
ADD COLUMN "monetizationPitch" VARCHAR(500),
ADD COLUMN "monetizationReviewedAt" TIMESTAMP(3),
ADD COLUMN "monetizationReviewedBy" TEXT,
ADD COLUMN "monetizationNote" VARCHAR(500);

ALTER TYPE "AdminAction" ADD VALUE 'MONETIZATION_APPROVED';
ALTER TYPE "AdminAction" ADD VALUE 'MONETIZATION_REJECTED';
ALTER TYPE "AdminAction" ADD VALUE 'MONETIZATION_REVOKED';
