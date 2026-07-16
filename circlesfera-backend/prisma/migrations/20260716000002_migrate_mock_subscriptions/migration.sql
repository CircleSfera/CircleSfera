-- Safely transfer subscriptions from the old mock plans to the real plans
UPDATE "platform_subscriptions"
SET "planId" = (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_UtQGHGBnYo5yGX' LIMIT 1)
WHERE "planId" IN (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_premium');

UPDATE "platform_subscriptions"
SET "planId" = (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_UtQG21Jd98Vidi' LIMIT 1)
WHERE "planId" IN (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_elite');

UPDATE "platform_subscriptions"
SET "planId" = (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_UtQGy36G3SscjF' LIMIT 1)
WHERE "planId" IN (SELECT id FROM "platform_plans" WHERE "stripeProductId" = 'prod_business');

-- Now it is safe to delete the mock plans
DELETE FROM "platform_plans" WHERE "stripeProductId" IN ('prod_premium', 'prod_elite', 'prod_business');
