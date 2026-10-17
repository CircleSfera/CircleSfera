-- An intellectual-property report names who holds the right and the work.
ALTER TABLE "reports" ADD COLUMN "rightsHolder" TEXT;
ALTER TABLE "reports" ADD COLUMN "workConcerned" TEXT;
