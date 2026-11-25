-- What a post or Frame is about, from a closed list (PD-084), given in the
-- background from its embedding. A new type and a nullable column: additive
-- only, the image before this one never names them.

CREATE TYPE "PostTopic" AS ENUM ('art_design', 'photography', 'film_video', 'music', 'dance', 'comedy', 'entertainment', 'fashion', 'beauty', 'home_decor', 'food_recipes', 'restaurants_bars', 'travel', 'nature_outdoors', 'pets_animals', 'sports', 'fitness', 'motoring', 'technology', 'gaming', 'science', 'learning', 'books', 'business', 'personal_finance', 'crafts_diy', 'gardening', 'parenting', 'weddings_events', 'shopping_deals', 'local_culture', 'other');

ALTER TABLE "posts" ADD COLUMN "topic" "PostTopic";
