-- A Profile's Favorites: the Profiles it reads in its Favorites feed.
CREATE TABLE "favorite_profiles" (
    "profileId" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_profiles_pkey" PRIMARY KEY ("profileId","favoriteId")
);

CREATE INDEX "favorite_profiles_favoriteId_idx" ON "favorite_profiles"("favoriteId");

ALTER TABLE "favorite_profiles" ADD CONSTRAINT "favorite_profiles_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_profiles" ADD CONSTRAINT "favorite_profiles_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
