/**
 * The kinds of creator a Creator Profile can say it is. A closed list: a
 * creator picks one, it cannot write its own. Each has its name in the app's
 * languages under `profile.creator.categories.<key>`.
 */
export const CREATOR_CATEGORIES = [
  'DIGITAL_CREATOR',
  'ARTIST',
  'MUSICIAN',
  'PHOTOGRAPHER',
  'VIDEO_CREATOR',
  'WRITER',
  'GAMER',
  'ATHLETE',
  'FITNESS_COACH',
  'CHEF',
  'COMEDIAN',
  'DANCER',
  'DESIGNER',
  'EDUCATOR',
  'FASHION',
  'BEAUTY',
  'TRAVEL',
  'PODCASTER',
  'PUBLIC_FIGURE',
  'OTHER',
] as const;

export type CreatorCategory = (typeof CREATOR_CATEGORIES)[number];
