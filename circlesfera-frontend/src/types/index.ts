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
  Purchase as IPurchase,
  RegisterDto as IRegisterDto,
  Report as IReport,
  SearchResult as ISearchResult,
  Story as IStory,
  SuggestedUser as ISuggestedUser,
  UpdateProfileDto as IUpdateProfileDto,
  User as IUser,
} from '@circlesfera/shared';
import type { StoryElement } from './story-element.types';

export type User = IUser;
export type Profile = IProfile & { isVerified?: boolean };
export type Post = IPost & {
  isPromoted?: boolean;
  promotionId?: string;
  isPremium?: boolean;
  price?: number | null;
  priceCents?: number | null;
  isLocked?: boolean;
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
  poll?: { id: string } | null;
  qnaBox?: { id: string } | null;
  isLocked?: boolean;
  priceCents?: number | null;
};
export type Collection = ICollection & {
  description?: string | null;
};
export type Audio = IAudio;
export type Place = IPlace;
export type PlaceMapPin = IPlaceMapPin;
export type PlaceDetail = IPlaceDetail;
export type Purchase = IPurchase;
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
  subscriptionPriceCents?: number;
  user?: {
    id: string;
    email: string;
    role?: string;
    createdAt: Date | string;
    providerAccountId?: string | null;
    isMonetizationEnabled?: boolean;
    isTwoFactorEnabled?: boolean;
    stripeConnectAccountId?: string | null;
    settings?: {
      isOnboarded: boolean;
      privacyLevel?: string;
    } | null;
  };
  _count?: {
    posts: number;
    followers: number;
    following: number;
  };
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  isVerified?: boolean;
  isPrivate?: boolean;
  banner?: string | null;
  inviteCode?: string;
  referredById?: string | null;
  identityVerifiedAt?: Date | string | null;
  emailConfirmed?: boolean;
}

export interface PostMediaItem {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  type?: string;
  filter?: string;
  altText?: string;
}
export type Participant = IParticipant & {
  isAdmin?: boolean;
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
  media?: PostMediaItem[];
  audioId?: string;
  audioStartMs?: number;
  tags?: {
    profileId: string;
    x: number;
    y: number;
  }[];
  isPremium?: boolean;
  priceCents?: number;
  scheduledAt?: string | Date;
  contentRating?: 'GENERAL' | 'MATURE';
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
  isPremium?: boolean;
  priceCents?: number;
  scheduledAt?: string | Date;
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
  // Ranking snapshot timestamp (DATA-003) — only present on score-based
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
