-- A post whose song is already mixed into its video: the song still counts
-- as used, but the player plays the video's own sound instead of the song.
ALTER TABLE "posts" ADD COLUMN "audioInVideo" BOOLEAN NOT NULL DEFAULT false;
