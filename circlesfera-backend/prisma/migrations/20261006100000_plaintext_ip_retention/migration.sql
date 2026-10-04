-- Records when the last plain-text IP was stored, so it can be erased 90 days
-- later. Existing last IPs have no date and are erased by the first run.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastIpAt" TIMESTAMP(3);

