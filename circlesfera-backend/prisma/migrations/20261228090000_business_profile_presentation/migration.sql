-- How a Business Profile presents itself: its kind of business, a contact
-- email and phone, and its address as a place. Only added, all nullable; no
-- data changes.

-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('RESTAURANT_BAR', 'CAFE_BAKERY', 'SHOP', 'FASHION_ACCESSORIES', 'BEAUTY_WELLNESS', 'HEALTH', 'SPORT_FITNESS', 'HOTEL_LODGING', 'TRAVEL_TOURISM', 'EDUCATION', 'PROFESSIONAL_SERVICES', 'HOME_CONSTRUCTION', 'MOTORING', 'TECHNOLOGY', 'MEDIA_ENTERTAINMENT', 'ART_CULTURE', 'EVENTS', 'REAL_ESTATE', 'FINANCE_INSURANCE', 'NON_PROFIT', 'OTHER');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "businessCategory" "BusinessCategory",
ADD COLUMN     "businessPlaceId" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT;

-- AddForeignKey
-- NOT VALID: the column is new and empty, so there is nothing to check;
-- it skips the scan of "profiles" under SHARE ROW EXCLUSIVE. Validated in
-- the next migration.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_businessPlaceId_fkey" FOREIGN KEY ("businessPlaceId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
