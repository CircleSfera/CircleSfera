-- The topics each person chose as their interests for ads (PD-084): one row
-- per person (User) who chose any, none for anyone under 18 or without a date
-- of birth. A new table only: additive, the image before this one never
-- names it. Erased with the account.

-- CreateTable
CREATE TABLE "ad_interests" (
    "userId" TEXT NOT NULL,
    "topics" "PostTopic"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_interests_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ad_interests" ADD CONSTRAINT "ad_interests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
