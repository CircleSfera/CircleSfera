-- Who each Profile restricts. Only adds: a table, erased with either
-- Profile, and a flag on comments waiting for the post author's approval.
CREATE TABLE "restrictions" (
    "id" TEXT NOT NULL,
    "restricterId" TEXT NOT NULL,
    "restrictedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restrictions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "restrictions_restrictedId_idx" ON "restrictions"("restrictedId");

CREATE UNIQUE INDEX "restrictions_restricterId_restrictedId_key" ON "restrictions"("restricterId", "restrictedId");

ALTER TABLE "restrictions" ADD CONSTRAINT "restrictions_restricterId_fkey" FOREIGN KEY ("restricterId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "restrictions" ADD CONSTRAINT "restrictions_restrictedId_fkey" FOREIGN KEY ("restrictedId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD COLUMN "awaitingApproval" BOOLEAN NOT NULL DEFAULT false;
