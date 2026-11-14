-- Staff decide on company verifications: who decided and why a rejection
-- was made; an approval a newer application took the place of; the audit
-- actions; and the staff permission to review them. Additive only.

CREATE TYPE "CompanyRejectionReason" AS ENUM ('DOCUMENTS_UNREADABLE', 'DOCUMENTS_NOT_ACCEPTED', 'DETAILS_DO_NOT_MATCH', 'NAME_NOT_IDENTITY', 'OTHER');

ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'COMPANY_VERIFICATION_APPROVED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'COMPANY_VERIFICATION_REJECTED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'COMPANY_DOCUMENT_VIEWED';

ALTER TYPE "CompanyVerificationStatus" ADD VALUE IF NOT EXISTS 'REPLACED';

ALTER TABLE "company_verifications" ADD COLUMN "decidedById" TEXT,
ADD COLUMN "rejectionNote" TEXT,
ADD COLUMN "rejectionReason" "CompanyRejectionReason";

-- The permission to review company verifications, which shows staff the
-- companies' documents: held by the super, platform and support roles
-- (owner decision).
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_company_verification', 'company_verification', 'Review company verifications and their documents')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT_ADMIN')
  AND p."key" = 'company_verification'
ON CONFLICT DO NOTHING;
