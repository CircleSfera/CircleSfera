-- Mapbox Places: canonical place rows + FKs on posts/stories.
-- Post.location string is retained as a denormalized display label.
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "mapboxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "locality" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "places_mapboxId_key" ON "places"("mapboxId");
CREATE INDEX "places_name_idx" ON "places"("name");

ALTER TABLE "posts" ADD COLUMN "placeId" TEXT;
ALTER TABLE "stories" ADD COLUMN "location" TEXT;
ALTER TABLE "stories" ADD COLUMN "placeId" TEXT;

CREATE INDEX "posts_placeId_idx" ON "posts"("placeId");
CREATE INDEX "stories_placeId_idx" ON "stories"("placeId");

ALTER TABLE "posts" ADD CONSTRAINT "posts_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stories" ADD CONSTRAINT "stories_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
