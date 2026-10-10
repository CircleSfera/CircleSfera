-- Staff permission to manage the plan catalogue.
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_plans', 'plans', 'Manage what each platform plan includes')
ON CONFLICT ("key") DO NOTHING;

-- Granted to SUPER_ADMIN and PLATFORM_ADMIN only.
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')
  AND p."key" = 'plans'
ON CONFLICT DO NOTHING;
