-- Names of each place per language of the app, so a place can be shown to
-- each person in their own language. Additive: existing places keep their
-- names and gain translations the next time someone tags them.

-- CreateTable
CREATE TABLE "place_translations" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "country" TEXT,
    "region" TEXT,
    "locality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "place_translations_placeId_locale_key" ON "place_translations"("placeId", "locale");

-- AddForeignKey
ALTER TABLE "place_translations" ADD CONSTRAINT "place_translations_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
