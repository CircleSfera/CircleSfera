-- Discovery map bbox queries on Place coordinates
CREATE INDEX "places_latitude_longitude_idx" ON "places"("latitude", "longitude");
