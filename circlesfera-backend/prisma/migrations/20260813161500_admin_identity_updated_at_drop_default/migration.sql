-- Align admin_identities.updatedAt with Prisma @updatedAt (no DB default).
ALTER TABLE "admin_identities" ALTER COLUMN "updatedAt" DROP DEFAULT;
