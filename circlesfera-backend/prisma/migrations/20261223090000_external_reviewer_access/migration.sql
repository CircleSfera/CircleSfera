-- An external reviewer (a payment provider checking what is sold here) signs
-- in to the staff panel with a staff identity that lasts only until a date.
ALTER TABLE "admin_identities" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);

ALTER TYPE "AdminAction" ADD VALUE 'ADMIN_ACCESS_EXPIRY_SET';
ALTER TYPE "AdminAction" ADD VALUE 'REVIEW_VIEWED';

-- What an external reviewer may open: the review area, to read only.
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_review', 'review', 'Read the review area: what is sold and how the rules are enforced')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "admin_roles" ("id", "name", "description") VALUES
  ('arole_external_reviewer', 'EXTERNAL_REVIEWER', 'External reviewer: reads the review area only, until a date')
ON CONFLICT ("name") DO NOTHING;

-- The reviewer role holds that one permission. SUPER_ADMIN and
-- PLATFORM_ADMIN hold it too, to see what a reviewer sees.
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."name" IN ('EXTERNAL_REVIEWER', 'SUPER_ADMIN', 'PLATFORM_ADMIN')
  AND p."key" = 'review'
ON CONFLICT DO NOTHING;
