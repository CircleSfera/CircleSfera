/**
 * What a post or Frame is about, from a closed list: one topic per post,
 * given in the background from the meaning of its words (PD-084). It is for
 * contextual ads and the interests a person chooses (AD_INTEREST_TOPICS);
 * it is never shown on a post and no public response carries it. The names
 * people read are in the app's translations (`adInterests.topics.<key>`).
 *
 * The list leaves out, on purpose, every subject an ad may not be aimed at
 * (DSA Art. 26, GDPR Art. 9): politics, religion, health, sexuality,
 * ethnicity, trade unions, and news. A post about one of them gets `other`,
 * never a topic near it. A key is never renamed or removed: posts keep it.
 */
export const POST_TOPICS = [
  'art_design',
  'photography',
  'film_video',
  'music',
  'dance',
  'comedy',
  'entertainment',
  'fashion',
  'beauty',
  'home_decor',
  'food_recipes',
  'restaurants_bars',
  'travel',
  'nature_outdoors',
  'pets_animals',
  'sports',
  'fitness',
  'motoring',
  'technology',
  'gaming',
  'science',
  'learning',
  'books',
  'business',
  'personal_finance',
  'crafts_diy',
  'gardening',
  'parenting',
  'weddings_events',
  'shopping_deals',
  'local_culture',
  'other',
] as const;

export type PostTopic = (typeof POST_TOPICS)[number];

/** The topic of a post that fits none of the others closely enough. */
export const POST_TOPIC_FALLBACK: PostTopic = 'other';

/** A topic a person may choose as an interest: any but `other`. */
export type AdInterestTopic = Exclude<PostTopic, 'other'>;

/**
 * The topics a person may choose as their interests for ads (PD-084; Notion
 * → Product → Product Specifications → Advertising: Pixel, Conversions and
 * Audiences, section 2), in the order of POST_TOPICS. `other` is what is
 * left over, not a subject, so nobody chooses it.
 */
export const AD_INTEREST_TOPICS: readonly AdInterestTopic[] =
  POST_TOPICS.filter(
    (topic): topic is AdInterestTopic => topic !== POST_TOPIC_FALLBACK,
  );

/** The most interests a person may choose at once. */
export const AD_INTERESTS_MAX = 10;

/**
 * Interests are never used for ads for anyone younger, nor for an account
 * without a date of birth: none is stored for them.
 */
export const AD_INTERESTS_MIN_AGE = 18;

/**
 * The feature flag that shows Settings → Ads, where interests are chosen:
 * the same flag as the ads consent (`ads_consent`, Ads 1). While it is off
 * no interest is taken and none is used.
 */
export const AD_INTERESTS_FLAG = 'ads_consent';

/** What GET and PUT /users/me/ad-interests answer. */
export interface AdInterestsStatus {
  /** The topics the person chose, in the order of POST_TOPICS. */
  interests: AdInterestTopic[];
  /** AD_INTERESTS_MAX. */
  maxInterests: number;
  /**
   * False under AD_INTERESTS_MIN_AGE or without a date of birth: no
   * interest can be chosen, and none is used.
   */
  allowed: boolean;
  /** The account has no date of birth, which is why `allowed` is false. */
  dateOfBirthMissing: boolean;
  /** When the person last chose (ISO 8601), or null when none is stored. */
  updatedAt: string | null;
}
