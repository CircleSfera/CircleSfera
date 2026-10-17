-- No day spends more than its budget per day, and one person sees a promotion
-- at most a few times a day and counts once.
-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "spendDay" DATE,
ADD COLUMN     "spentTodayCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promotion_views" (
    "promotionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "promotion_views_pkey" PRIMARY KEY ("promotionId","userId","day")
);

-- CreateIndex
CREATE INDEX "promotion_views_userId_day_idx" ON "promotion_views"("userId", "day");

-- CreateIndex
CREATE INDEX "promotion_views_day_idx" ON "promotion_views"("day");

-- AddForeignKey
ALTER TABLE "promotion_views" ADD CONSTRAINT "promotion_views_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_views" ADD CONSTRAINT "promotion_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

