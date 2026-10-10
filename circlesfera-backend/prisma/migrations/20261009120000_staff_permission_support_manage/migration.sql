-- Staff permission for who leads the support team: give a ticket to another
-- agent and manage the saved replies the team shares.
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_support_manage', 'support.manage', 'Lead the support team: assign tickets and manage shared saved replies')
ON CONFLICT ("key") DO NOTHING;

-- Granted to SUPER_ADMIN and PLATFORM_ADMIN only.
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "admin_roles" r
CROSS JOIN "admin_permissions" p
WHERE r."name" IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')
  AND p."key" = 'support.manage'
ON CONFLICT DO NOTHING;
