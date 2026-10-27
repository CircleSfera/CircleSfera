-- A chat message is either one a member wrote or a notice from the app about
-- the group, such as someone becoming admin. Every message there is today was
-- written by a member and keeps that kind. Additive: no data moves.

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'ADMIN_GRANTED');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'USER';
