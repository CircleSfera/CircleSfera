import type {
  Audio as IAudio,
  Collection as ICollection,
  Comment as IComment,
  Conversation as IConversation,
  CreateCommentDto as ICreateCommentDto,
  LoginDto as ILoginDto,
  Message as IMessage,
  Notification as INotification,
  Participant as IParticipant,
  Place as IPlace,
  PlaceDetail as IPlaceDetail,
  PlaceMapPin as IPlaceMapPin,
  PlatformPlanDto as IPlatformPlanDto,
  Post as IPost,
  PostMedia as IPostMedia,
  Profile as IProfile,
  RegisterDto as IRegisterDto,
  Report as IReport,
  SearchResult as ISearchResult,
  Story as IStory,
  SuggestedUser as ISuggestedUser,
  UpdateProfileDto as IUpdateProfileDto,
  User as IUser,
  PostShape,
  StoryStickerInput,
} from '@circlesfera/shared';
import type { ChatGif } from '../services/gifs.service';
import type { FeedSticker, StoryStickerRef } from '../utils/storySticker';
import type { StoryElement } from './story-element.types';

export type User = IUser;
export type Profile = IProfile & { isVerified?: boolean };
export type Post = IPost & {
  /** The shape its items show in; none for a Frame and for older posts. */
  shape?: PostShape | null;
  // Set when its author archived it: shown in their archive only.
  archivedAt?: string | null;
  visibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  // Set when its author pinned it to the top of their profile.
  pinnedToProfileAt?: string | null;
  isPromoted?: boolean;
  promotionId?: string;
  // The countries a promoted post is aimed at; empty for everywhere.
  promotionCountries?: string[];
  recommendationReason?: string;
  recommendationSignals?: string[];
  shouldBlurSensitive?: boolean;
  poll?: { id: string } | null;
  qnaBox?: { id: string } | null;
};
export type PostMedia = IPostMedia;
export type Comment = IComment & {
  user: {
    id: string;
    profile: Profile;
    verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  };
  replies?: Comment[];
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  voiceWaveform?: unknown;
};
export type Story = IStory & {
  /** With where the creator placed it on the story, when it was kept. */
  poll?: StoryStickerRef | null;
  qnaBox?: StoryStickerRef | null;
  /** Polls, questions and the rest, where the creator placed them. */
  stickers?: FeedSticker[];
};
export type Collection = ICollection & {
  description?: string | null;
};
export type Audio = IAudio;
export type Place = IPlace;
export type PlaceMapPin = IPlaceMapPin;
export type PlaceDetail = IPlaceDetail;
export interface WebhookEvent {
  id: string;
  provider: string;
  externalId: string;
  payload: unknown;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  processedAt?: Date | string | null;
  createdAt: Date | string;
}
export type { StoryElement };
export type SuggestedUser = ISuggestedUser;
export type PlatformPlanDto = IPlatformPlanDto;

export interface ProfileWithUser extends IProfile {
  user?: {
    id: string;
    // Only present on the authenticated user's own profile; the API never
    // returns another account's email.
    email?: string;
    role?: string;
    createdAt: Date | string;
    providerAccountId?: string | null;
    isTwoFactorEnabled?: boolean;
    // Own profile only: language of the account's emails and notices.
    locale?: 'en' | 'es';
    settings?: {
      isOnboarded: boolean;
    } | null;
  };
  _count?: {
    posts: number;
    followers: number;
    following: number;
  };
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  // Colour chosen for the profile page; empty means the colour of the app.
  accentColor?: string | null;
  // Set when the session acts as this Profile as a team member: the role.
  memberRole?: 'ADMINISTRATOR' | 'EDITOR';
  isVerified?: boolean;
  isPrivate?: boolean;
  banner?: string | null;
  identityVerifiedAt?: Date | string | null;
  // False when the identity was verified before its date of birth was read
  // from the document: verifying again confirms it.
  dateOfBirthVerified?: boolean;
  emailConfirmed?: boolean;
}

export interface PostMediaItem {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  /** The moment the author chose as the cover of a frame, if any. */
  coverTimeMs?: number | null;
  type?: string;
  filter?: string;
  altText?: string;
}
export type Participant = IParticipant & {
  isAdmin?: boolean;
  deletedAt?: string | null;
};
export type Conversation = Omit<IConversation, 'messages' | 'participants'> & {
  avatarUrl?: string | null;
  messages: Message[];
  participants: Participant[];
};
export type Notification = INotification;
export type SearchResult = ISearchResult;
export type Report = IReport;

export type RegisterDto = IRegisterDto;
export type LoginDto = ILoginDto;
export type UpdateProfileDto = IUpdateProfileDto & {
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
};
export type CreateCommentDto = ICreateCommentDto & {
  voiceUrl?: string;
  voiceDuration?: number;
  voiceWaveform?: number[];
};

export type CreatePostDto = {
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
  /** For a frame: the moment of its video to use as the cover. */
  coverTimeMs?: number;
  /** For a frame: an uploaded image to use as the cover instead. */
  coverImageUrl?: string;
  media?: PostMediaItem[];
  audioId?: string;
  audioStartMs?: number;
  tags?: {
    profileId: string;
    x: number;
    y: number;
  }[];
  scheduledAt?: string | Date;
  contentRating?: 'GENERAL' | 'MATURE';
  /** The shape every item shows in; a post only. */
  shape?: PostShape;
};

export type CreateStoryDto = {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  mediaType?: string;
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
  scheduledAt?: string | Date;
  /** Polls, questions, quizzes, sliders and hashtags, up to ten. */
  stickers?: StoryStickerInput[];
};

export type Message = Omit<
  IMessage,
  'sender' | 'replyTo' | 'createdAt' | 'updatedAt'
> & {
  tempId?: string;
  mediaType?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  sender?: ProfileWithUser;
  reactions?: {
    id: string;
    reaction: string;
    profileId?: string;
    userId?: string;
    profile?: Pick<Profile, 'username'>;
  }[];
  replyTo?:
    | (Omit<IMessage, 'sender'> & {
        sender?: ProfileWithUser;
      })
    | null;
  postId?: string | null;
  post?: Post;
  storyId?: string;
  story?: Story;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  voiceWaveform?: unknown;
  // A GIF from GIPHY, as the server kept it.
  gif?: ChatGif | null;
};

export interface UserWithProfile {
  id: string;
  email: string;
  profile: Profile;
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  // Ranking snapshot timestamp — only present on score-based
  // feeds (e.g. the hybrid "for you" feed). Echo it back on subsequent
  // page requests for the same scroll session so the ranking basis
  // doesn't drift out from under already-fetched pages.
  asOf?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  verified?: boolean;
  userId?: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  createdAt: string;
}

export interface HighlightStory {
  id: string;
  highlightId: string;
  storyId: string;
  createdAt: string;
  story: Story;
}

export interface Highlight {
  id: string;
  userId: string;
  title: string;
  coverUrl: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    profile: Profile;
  };
  stories?: HighlightStory[];
}

export * from './error';
