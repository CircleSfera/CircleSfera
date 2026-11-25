-- Founding creators (BD-034): a Creator Profile applies with links to its
-- work, its city and a note; staff approve or decline it in the Backoffice,
-- and an approved Profile gets the Verified plan free for a year, marked on
-- its subscription. The audit actions of a decision and the staff
-- permission to decide. Additive only.

CREATE TYPE "FoundingCreatorStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TYPE "FoundingCreatorDeclineReason" AS ENUM ('LINKS_UNREACHABLE', 'NOT_VIDEO_WORK', 'OUTSIDE_LAUNCH_AREA', 'PROGRAM_FULL', 'OTHER');

ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'FOUNDING_CREATOR_APPROVED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'FOUNDING_CREATOR_DECLINED';

-- Every subscription so far was bought: none is a free year.
ALTER TABLE "platform_subscriptions" ADD COLUMN "foundingCreatorYear" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "founding_creator_applications" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "FoundingCreatorStatus" NOT NULL DEFAULT 'PENDING',
    "links" TEXT[],
    "city" TEXT NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "declineReason" "FoundingCreatorDeclineReason",
    "declineNote" TEXT,
    "freeYearAcceptedAt" TIMESTAMP(3),
    "freeYearConsentVersion" TEXT,
    "freeYearTaxable" BOOLEAN,
    "platformSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "founding_creator_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "founding_creator_applications_platformSubscriptionId_key" ON "founding_creator_applications"("platformSubscriptionId");

CREATE INDEX "founding_creator_applications_profileId_idx" ON "founding_creator_applications"("profileId");

CREATE INDEX "founding_creator_applications_status_createdAt_idx" ON "founding_creator_applications"("status", "createdAt");

-- Erased with the Profile, and so with the account.
ALTER TABLE "founding_creator_applications" ADD CONSTRAINT "founding_creator_applications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "founding_creator_applications" ADD CONSTRAINT "founding_creator_applications_platformSubscriptionId_fkey" FOREIGN KEY ("platformSubscriptionId") REFERENCES "platform_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one application waiting for staff or approved per Profile: two
-- requests at once still cannot leave two.
CREATE UNIQUE INDEX "founding_creator_applications_one_open_per_profile"
ON "founding_creator_applications" ("profileId")
WHERE "status" IN ('PENDING', 'APPROVED');

-- The permission to decide on founding creators, which gives a plan for
-- free: held by the super and platform roles.
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_founding_creators', 'founding_creators', 'Approve or decline founding creators, who get the Verified plan free for a year')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')
  AND p."key" = 'founding_creators'
ON CONFLICT DO NOTHING;
