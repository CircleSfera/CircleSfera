-- Language of each account, for emails and notices built on the server.
-- Additive: existing accounts start in Spanish and follow the app language
-- the next time it is synced.

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'es');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'es';

