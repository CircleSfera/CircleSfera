-- The Profile colour and the feed without promoted posts follow a plan's
-- features instead of its badge (PD-088). The plans that give them get the
-- features here, so no Profile loses them between the deploy and the next
-- plan catalog sync, which sets the same features from then on.

-- Elite Creator and Business: the colour they already gave by their badge.
UPDATE "platform_plans"
SET "features" = array_append("features", 'profile_colour')
WHERE "badge" IN ('ELITE', 'BUSINESS')
  AND NOT ('profile_colour' = ANY ("features"));

-- Premium, the plan with a verified badge and priority support: the feed
-- without promoted posts and the colour (owner, 2026-11-24, PD-088).
UPDATE "platform_plans"
SET "features" = array_append("features", 'no_promoted_content')
WHERE "badge" = 'VERIFIED'
  AND 'priority_support' = ANY ("features")
  AND NOT ('no_promoted_content' = ANY ("features"));

UPDATE "platform_plans"
SET "features" = array_append("features", 'profile_colour')
WHERE "badge" = 'VERIFIED'
  AND 'priority_support' = ANY ("features")
  AND NOT ('profile_colour' = ANY ("features"));
