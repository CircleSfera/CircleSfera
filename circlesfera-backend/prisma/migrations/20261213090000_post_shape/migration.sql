-- The shape of a post (1:1, 4:5 or 1.91:1). Empty for every post until now,
-- which keeps showing as 4:5; nothing is rewritten.
CREATE TYPE "PostShape" AS ENUM ('SQUARE', 'PORTRAIT', 'LANDSCAPE');

ALTER TABLE "posts" ADD COLUMN "shape" "PostShape";
