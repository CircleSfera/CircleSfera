export interface RegisterDto {
  email: string;
  password: string;
  username: string;
  fullName?: string;
}

export interface LoginDto {
  identifier: string;
  password: string;
}

export interface UpdateProfileDto {
  fullName?: string;
  username?: string;
  bio?: string;
  avatar?: string;
  website?: string | null;
  isPrivate?: boolean;
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
}

export interface CreatePostDto {
  caption?: string;
  type?: 'POST' | 'FRAME';
  location?: string;
  hideLikes?: boolean;
  turnOffComments?: boolean;
  media?: Array<{
    url: string;
    type: string;
    filter?: string;
    altText?: string;
  }>;
  audioId?: string;
  isPremium?: boolean;
  price?: number;
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
  isCloseFriendsOnly?: boolean;
  audioId?: string;
  isPremium?: boolean;
  price?: number;
}

export interface PlatformPlanDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  stripePriceId: string;
}
