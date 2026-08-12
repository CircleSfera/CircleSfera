-- Admin Panel: Admin Identity + RBAC

-- Enums
CREATE TYPE "AdminIdentityStatus" AS ENUM ('ACTIVE', 'DISABLED');

ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_LOGIN';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_LOGOUT';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_LOGIN_FAILED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_MFA_ENABLED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ROLE_ASSIGNED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ROLE_REVOKED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_IDENTITY_CREATED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_IDENTITY_DISABLED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_STEP_UP';

-- Admin identity tables
CREATE TABLE "admin_identities" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "AdminIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "linkedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_identities_email_key" ON "admin_identities"("email");
CREATE INDEX "admin_identities_linkedUserId_idx" ON "admin_identities"("linkedUserId");
CREATE INDEX "admin_identities_status_idx" ON "admin_identities"("status");

ALTER TABLE "admin_identities"
  ADD CONSTRAINT "admin_identities_linkedUserId_fkey"
  FOREIGN KEY ("linkedUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_permissions_key_key" ON "admin_permissions"("key");

CREATE TABLE "admin_role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

ALTER TABLE "admin_role_permissions"
  ADD CONSTRAINT "admin_role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_role_permissions"
  ADD CONSTRAINT "admin_role_permissions_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_identity_roles" (
    "adminId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "admin_identity_roles_pkey" PRIMARY KEY ("adminId","roleId")
);

ALTER TABLE "admin_identity_roles"
  ADD CONSTRAINT "admin_identity_roles_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_identity_roles"
  ADD CONSTRAINT "admin_identity_roles_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_refresh_tokens_token_key" ON "admin_refresh_tokens"("token");
CREATE INDEX "admin_refresh_tokens_adminId_idx" ON "admin_refresh_tokens"("adminId");

ALTER TABLE "admin_refresh_tokens"
  ADD CONSTRAINT "admin_refresh_tokens_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "admin_passkeys" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_passkeys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_passkeys_credentialID_key" ON "admin_passkeys"("credentialID");
CREATE INDEX "admin_passkeys_adminId_idx" ON "admin_passkeys"("adminId");

ALTER TABLE "admin_passkeys"
  ADD CONSTRAINT "admin_passkeys_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed permissions (stable UUIDs)
INSERT INTO "admin_permissions" ("id", "key", "description") VALUES
  ('aperm_reports', 'reports', 'View and manage reports'),
  ('aperm_appeals', 'appeals', 'View and resolve appeals'),
  ('aperm_moderation', 'moderation', 'Moderation queue and actions'),
  ('aperm_users_read', 'users.read', 'Read user accounts'),
  ('aperm_users_write', 'users.write', 'Update user accounts'),
  ('aperm_users_ban', 'users.ban', 'Ban, warn, suspend users'),
  ('aperm_payments', 'payments', 'Payments and monetization'),
  ('aperm_system', 'system', 'System settings and health'),
  ('aperm_experiments', 'experiments', 'Feature flags and experiments'),
  ('aperm_support', 'support', 'Support tickets'),
  ('aperm_audit', 'audit', 'Read audit logs'),
  ('aperm_live', 'live', 'Live stream ops'),
  ('aperm_content', 'content', 'Posts, comments, stories, media'),
  ('aperm_admins_manage', 'admins.manage', 'Manage AdminIdentity and roles');

-- Seed roles
INSERT INTO "admin_roles" ("id", "name", "description") VALUES
  ('arole_super', 'SUPER_ADMIN', 'Full admin panel access'),
  ('arole_platform', 'PLATFORM_ADMIN', 'Platform operations except identity management'),
  ('arole_moderation', 'MODERATION_ADMIN', 'Trust and safety'),
  ('arole_support', 'SUPPORT_ADMIN', 'Support and appeals'),
  ('arole_finance', 'FINANCE_ADMIN', 'Payments and payouts'),
  ('arole_content', 'CONTENT_ADMIN', 'Content and media'),
  ('arole_security', 'SECURITY_ADMIN', 'Firewall, audit, security settings'),
  ('arole_analytics', 'ANALYTICS_ADMIN', 'Analytics read access');

-- SUPER_ADMIN gets all permissions
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_super', "id" FROM "admin_permissions";

-- PLATFORM_ADMIN: all except admins.manage
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_platform', "id" FROM "admin_permissions" WHERE "key" <> 'admins.manage';

-- MODERATION_ADMIN
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_moderation', "id" FROM "admin_permissions"
WHERE "key" IN ('reports','appeals','moderation','users.read','users.ban','support','audit','live','content');

-- SUPPORT_ADMIN
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_support', "id" FROM "admin_permissions"
WHERE "key" IN ('support','appeals','users.read');

-- FINANCE_ADMIN
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_finance', "id" FROM "admin_permissions"
WHERE "key" IN ('payments','users.read');

-- CONTENT_ADMIN
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_content', "id" FROM "admin_permissions"
WHERE "key" IN ('content','live','moderation','users.read');

-- SECURITY_ADMIN
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_security', "id" FROM "admin_permissions"
WHERE "key" IN ('system','audit','experiments','users.read');

-- ANALYTICS_ADMIN (read-oriented: system health stats via system + audit)
INSERT INTO "admin_role_permissions" ("roleId", "permissionId")
SELECT 'arole_analytics', "id" FROM "admin_permissions"
WHERE "key" IN ('system','audit','users.read','payments');

-- Rewire admin_audit_logs FK from users → admin_identities
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS "admin_audit_logs_adminId_fkey";

ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "legacyUserId" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "requestId" TEXT;

UPDATE "admin_audit_logs" SET "legacyUserId" = "adminId" WHERE "legacyUserId" IS NULL;

-- Unusable password placeholder (operators must bootstrap via script)
-- bcrypt of 'CHANGE_ME_VIA_BOOTSTRAP' — operators reset via bootstrap-admin.ts
-- Placeholder hash: $2b$10$invalid.hash.force.reset.xxxxxxxxxxxxxxxxxxxxxxx (not a valid verify)

-- Migrate staff Users → AdminIdentity
INSERT INTO "admin_identities" (
  "id", "email", "passwordHash", "displayName", "status",
  "totpEnabled", "mfaRequired", "linkedUserId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."email",
  '$2b$10$AdminPanel.ResetRequired.placeholderXXXXX',
  COALESCE(p."username", split_part(u."email", '@', 1)),
  'ACTIVE',
  false,
  true,
  u."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "profiles" p ON p."userId" = u."id"
WHERE u."role" IN ('ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE')
ON CONFLICT ("email") DO NOTHING;

-- Assign roles from legacy User.role
INSERT INTO "admin_identity_roles" ("adminId", "roleId")
SELECT ai."id",
  CASE u."role"
    WHEN 'ADMIN' THEN 'arole_super'
    WHEN 'MODERATOR' THEN 'arole_moderation'
    WHEN 'SUPPORT' THEN 'arole_support'
    WHEN 'FINANCE' THEN 'arole_finance'
  END
FROM "admin_identities" ai
JOIN "users" u ON u."id" = ai."linkedUserId"
WHERE u."role" IN ('ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE')
ON CONFLICT DO NOTHING;

-- Point audit logs at new identities where possible
UPDATE "admin_audit_logs" aal
SET "adminId" = ai."id"
FROM "admin_identities" ai
WHERE aal."legacyUserId" = ai."linkedUserId";

-- Rows without a matching identity: clear adminId (kept in legacyUserId)
UPDATE "admin_audit_logs" aal
SET "adminId" = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_identities" ai WHERE ai."id" = aal."adminId"
);

ALTER TABLE "admin_audit_logs" ALTER COLUMN "adminId" DROP NOT NULL;

ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "admin_audit_logs_legacyUserId_idx" ON "admin_audit_logs"("legacyUserId");

-- Demote platform staff roles (admin panel uses AdminIdentity)
UPDATE "users"
SET "role" = 'USER'
WHERE "role" IN ('ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE');
