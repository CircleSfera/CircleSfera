export interface User {
  id: string;
  email: string;
  createdAt: Date | string;
  isOnline?: boolean;
  lastSeenAt?: Date | string | null;
  stripeAccountId?: string | null;
  isMonetizationEnabled?: boolean;
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
}

export interface Profile {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  bio: string | null;
  avatar: string | null;
  website: string | null;
  location?: string | null;
  isPrivate: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProfileWithUser extends Profile {
  user?: {
    id: string;
    email: string;
    role?: string;
    createdAt: Date | string;
    _count?: {
      posts: number;
      followers: number;
      following: number;
    };
  };
}

export interface Audio {
  id: string;
  title: string;
  artist: string;
  url: string;
  thumbnailUrl?: string;
  duration: number;
}

export interface PostMedia {
  id: string;
  url: string;
  type: string;
  filter?: string;
  order: number;
}

export interface Post {
  id: string;
  userId: string;
  caption: string | null;
  media: PostMedia[];
  type?: string;

  isPremium?: boolean;
  price?: number | null;
  currency?: string;
  isPurchased?: boolean;

  audioId?: string;
  audio?: Audio;
  
  createdAt: Date | string;
  updatedAt: Date | string;
  user: {
    id: string;
    email: string;
    profile: Profile;
    role?: string;
    verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
    accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  };
  _count: {
    likes: number;
    comments: number;
  };
  isLiked?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  user: {
    id: string;
    email: string;
    profile: Profile;
  };
  parentId?: string | null;
  replies?: Comment[];
  likes?: { userId: string }[];
  _count?: {
    replies: number;
    likes: number;
  };
}

export interface CommentLike {
  id: string;
  commentId: string;
  userId: string;
  createdAt: Date | string;
}

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: string;
  filter?: string;
  expiresAt: Date | string;
  createdAt: Date | string;

  isPremium?: boolean;
  price?: number | null;
  currency?: string;
  isPurchased?: boolean;
  user: {
    id: string;
    email: string;
    profile: Profile;
    verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
    accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  };
  isCloseFriendsOnly?: boolean;
  audioId?: string;
  audio?: Audio;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  coverUrl?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  _count?: {
    bookmarks: number;
  };
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  postId?: string;
  replyToId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  sender?: {
    id: string;
    profile: Profile;
  };
}

export interface Participant {
  id: string;
  userId: string;
  lastReadAt?: Date | string;
  user: {
    id: string;
    isOnline?: boolean;
    profile: Profile;
  };
}

export interface Conversation {
  id: string;
  updatedAt: Date | string;
  isGroup: boolean;
  name?: string | null;
  participants: Participant[];
  messages: Message[];
}

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string | null;
  type: string;
  content: string;
  read: boolean;
  createdAt: Date | string;
  postId?: string;
  commentId?: string;
  sender: {
    id: string;
    email: string;
    profile: Profile;
  } | null;
}

export interface SearchResult {
  users: Array<{
    id: string;
    profile: Profile;
  }>;
  hashtags: Array<{
    id: string;
    tag: string;
    postCount: number;
  }>;
  semanticResults?: Post[];
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'user' | 'post';
  targetId: string;
  reason: string;
  details?: string | null;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: Date | string;
  updatedAt: Date | string;
  reporter?: {
    id: string;
    email: string;
    profile: Profile;
  };
}
