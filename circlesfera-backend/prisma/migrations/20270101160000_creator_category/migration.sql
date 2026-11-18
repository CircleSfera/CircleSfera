-- The kind of creator a Creator Profile may say it is, from a closed list.
CREATE TYPE "CreatorCategory" AS ENUM ('DIGITAL_CREATOR', 'ARTIST', 'MUSICIAN', 'PHOTOGRAPHER', 'VIDEO_CREATOR', 'WRITER', 'GAMER', 'ATHLETE', 'FITNESS_COACH', 'CHEF', 'COMEDIAN', 'DANCER', 'DESIGNER', 'EDUCATOR', 'FASHION', 'BEAUTY', 'TRAVEL', 'PODCASTER', 'PUBLIC_FIGURE', 'OTHER');

ALTER TABLE "profiles" ADD COLUMN "creatorCategory" "CreatorCategory";
