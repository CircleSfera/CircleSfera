-- CreateTable
CREATE TABLE IF NOT EXISTS "passkey_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkey_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_challenges_challenge_key" ON "passkey_challenges"("challenge");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "passkey_challenges_userId_scope_idx" ON "passkey_challenges"("userId", "scope");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "passkey_challenges_expiresAt_idx" ON "passkey_challenges"("expiresAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'passkey_challenges_userId_fkey'
  ) THEN
    ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
