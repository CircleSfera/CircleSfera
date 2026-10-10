-- Colour a Profile chooses for its page, from a closed list the app defines.
-- Additive: empty means the colour of the app, which is what every existing
-- Profile keeps.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "accentColor" TEXT;
