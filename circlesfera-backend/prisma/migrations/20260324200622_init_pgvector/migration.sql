/*
  Warnings:

  - You are about to alter the column `vector` on the `post_embeddings` table. The data in that column could be lost. The data in that column will be cast from `JsonB` to `Unsupported("vector(1536)")`.
  - Made the column `vector` on table `post_embeddings` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Truncate old jsonb mock vectors
TRUNCATE TABLE "post_embeddings";

-- AlterTable
ALTER TABLE "post_embeddings" DROP COLUMN "vector",
ADD COLUMN "vector" vector(1536) NOT NULL;
