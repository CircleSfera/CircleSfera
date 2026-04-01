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
}

export interface CreatePostDto {
  type?: string;
  caption?: string;
  audioId?: string;
  media?: Array<{
    url: string;
    type: string;
    filter?: string;
    altText?: string;
  }>;
  isPremium?: boolean;
  price?: number;
}

export interface CreateCommentDto {
  content: string;
  parentId?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface CreateStoryDto {
  mediaUrl: string;
  mediaType?: string;
  isCloseFriendsOnly?: boolean;
  audioId?: string;
  isPremium?: boolean;
  price?: number;
}
