export interface RegisterDto {
  email: string;
  password: string;
  username: string;
  fullName?: string;
  inviteCode?: string;
  // ISO date string (YYYY-MM-DD). Required; must be 16+.
  dateOfBirth: string;
  captchaToken?: string;
  visitorId?: string;
  // App language at sign-up ('en' or 'es'), for the account's emails.
  locale?: 'en' | 'es';
  // False when the person says no to the newsletter at sign-up.
  newsletter?: boolean;
}

export interface LoginDto {
  identifier: string;
  password: string;
  twoFactorCode?: string;
  captchaToken?: string;
  visitorId?: string;
}

export interface UpdateProfileDto {
  fullName?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  website?: string | null;
  isPrivate?: boolean;
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  // Colour of the Profile page, from the closed list; null = the default.
  accentColor?: string | null;
}

export interface CreatePostDto {
  caption?: string;
  type?: 'POST' | 'FRAME';
  location?: string;
  placeId?: string;
  place?: {
    mapboxId: string;
    name: string;
    fullName?: string;
    latitude: number;
    longitude: number;
    country?: string;
    region?: string;
    locality?: string;
  };
  hideLikes?: boolean;
  turnOffComments?: boolean;
  media?: Array<{
    url: string;
    type: string;
    filter?: string;
    altText?: string;
  }>;
  audioId?: string;
  audioStartMs?: number;
  tags?: Array<{ profileId: string; x: number; y: number }>;
  isPremium?: boolean;
  priceCents?: number;
}

export interface CreateCommentDto {
  content: string;
  parentId?: string;
  url?: string;
  mediaType?: string;
}

export interface CreateStoryDto {
  url: string;
  mediaType?: string;
  /** The painted layer of a video story, joined to its video by the server. */
  overlayUrl?: string;
  isCloseFriendsOnly?: boolean;
  audioId?: string;
  audioStartMs?: number;
  location?: string;
  placeId?: string;
  place?: {
    mapboxId: string;
    name: string;
    fullName?: string;
    latitude: number;
    longitude: number;
    country?: string;
    region?: string;
    locality?: string;
  };
  isPremium?: boolean;
  priceCents?: number;
  /** The stickers of the story, up to ten. */
  stickers?: StoryStickerInput[];
}

/** The kinds of sticker a story can carry. */
export type StoryStickerKind =
  | 'POLL'
  | 'QUESTION'
  | 'QUIZ'
  | 'SLIDER'
  | 'MENTION'
  | 'LOCATION'
  | 'HASHTAG'
  | 'COUNTDOWN'
  | 'LINK'
  | 'MUSIC';

/**
 * A sticker sent with a new story: what it holds, checked by the server for
 * its kind, and where it sits (centre as a share of the story's width and
 * height from its middle, scale, angle in degrees).
 */
export interface StoryStickerInput {
  kind: StoryStickerKind;
  settings: Record<string, unknown>;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface PlatformPlanDto {
  id: string;
  name: string;
  description: string | null;
  // Integer cents — source of truth.
  priceCents: number;
  yearlyPriceCents?: number | null;
  currency: string;
  interval: string;
  features: string[];
  stripePriceId: string;
}
