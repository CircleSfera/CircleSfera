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
  PlatformPlanDto as IPlatformPlanDto,
  Post as IPost,
  PostMedia as IPostMedia,
  Profile as IProfile,
  Purchase as IPurchase,
  RegisterDto as IRegisterDto,
  Report as IReport,
  SearchResult as ISearchResult,
  Story as IStory,
  StoryElement as IStoryElement,
  SuggestedUser as ISuggestedUser,
  UpdateProfileDto as IUpdateProfileDto,
  User as IUser,
  WebhookEvent as IWebhookEvent,
} from '@circlesfera/shared';

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
};
export type PostMedia = IPostMedia;
export type Comment = IComment & {
  user: {
    id: string;
    profile: Profile;
    verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  };
  replies?: Comment[];
};
export type Story = IStory;
export type Collection = ICollection;
export type Audio = IAudio;
export type Purchase = IPurchase;
export type WebhookEvent = IWebhookEvent;
export type StoryElement = IStoryElement;
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
    verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
    accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
    stripeConnectAccountId?: string | null;
    _count?: {
      posts: number;
      followers: number;
      following: number;
    };
  };
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  isVerified?: boolean;
  banner?: string | null;
  inviteCode?: string;
  referredById?: string | null;
  identityVerifiedAt?: Date | string | null;
}

export interface PostMediaItem {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  type?: string;
  filter?: string;
  altText?: string;
}
export type Participant = Omit<IParticipant, 'user'> & {
  isAdmin?: boolean;
  user?: {
    id: string;
    isOnline?: boolean;
    profile: Profile;
  };
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
export type CreateCommentDto = ICreateCommentDto;

export type CreatePostDto = {
  caption?: string;
  type?: 'POST' | 'FRAME';
  location?: string;
  hideLikes?: boolean;
  turnOffComments?: boolean;
  media?: PostMediaItem[];
  audioId?: string;
  tags?: {
    userId: string;
    x: number;
    y: number;
  }[];
  isPremium?: boolean;
  priceCents?: number;
};

export type CreateStoryDto = {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  mediaType?: string;
  isCloseFriendsOnly?: boolean;
  audioId?: string;
  isPremium?: boolean;
  priceCents?: number;
};

export type Message = Omit<
  IMessage,
  'sender' | 'replyTo' | 'createdAt' | 'updatedAt'
> & {
  tempId?: string;
  mediaType?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  sender?: {
    id: string;
    profile: Profile;
  };
  reactions?: {
    id: string;
    reaction: string;
    userId: string;
    user?: {
      id: string;
      profile: {
        username: string;
      };
    };
  }[];
  replyTo?:
    | (Omit<IMessage, 'sender'> & {
        sender?: {
          id: string;
          profile: Partial<Profile>;
        };
      })
    | null;
  post?: Post;
  storyId?: string;
  story?: Story;
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
