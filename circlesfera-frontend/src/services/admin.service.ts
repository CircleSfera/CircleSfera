import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

export interface AdminStats {
  users: number;
  posts: number;
  stories: number;
  pendingReports: number;
}

export interface EnhancedStats extends AdminStats {
  newUsersThisWeek: number;
  userGrowth: number;
  newPostsThisWeek: number;
  postGrowth: number;
  engagement: number;
  reportedContentPercent: number;
  activeUsersToday: number;
  recentActivity: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string | null;
  createdAt: string;
  adminUsername: string;
}

export interface AdminUser {
  id: string;
  email: string;
  isActive: boolean;
  role: string;
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  createdAt: string;
  postCount: number;
  profile?: {
    username: string;
    fullName: string | null;
    avatar: string | null;
    standardUrl?: string | null;
    thumbnailUrl?: string | null;
  } | null;
  identityVerifiedAt?: string | null;
  stripeIdentitySessionId?: string | null;
}

export interface AdminPost {
  id: string;
  caption: string | null;
  type: string;
  createdAt: string;
  media?:
    | {
        url: string;
        standardUrl?: string;
        thumbnailUrl?: string;
        type?: string;
      }[]
    | null;
  moderationStatus: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'REMOVED';
  moderationNote?: string | null;
  user?: {
    profile: {
      username: string;
      avatar?: string | null;
    };
  } | null;
  _count?: {
    likes: number;
    comments: number;
  };
}

export interface AdminReport {
  id: string;
  reason: string;
  details?: string | null;
  status: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  reporter?: {
    profile?: {
      username: string;
      avatar: string | null;
      standardUrl?: string | null;
      thumbnailUrl?: string | null;
    } | null;
  } | null;
  targetContent?: {
    thumbnail?: string | null;
    text?: string | null;
    type?: string;
    author?: string;
  } | null;
}

export interface ActivityChartDay {
  date: string;
  posts: number;
  users: number;
}

export interface TopUser {
  id: string;
  username: string;
  avatar: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
  fullName: string | null;
  totalLikes: number;
  totalComments: number;
  engagement: number;
}

export interface AdminHashtag {
  id: string;
  tag: string;
  postCount: number;
  createdAt: string;
}

export interface AdminComment {
  id: string;
  content: string;
  createdAt: string;
  user?: {
    profile?: {
      username: string;
      avatar: string | null;
      standardUrl?: string | null;
      thumbnailUrl?: string | null;
    } | null;
  } | null;
  post?: { id: string; caption: string | null } | null;
  moderationStatus: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'REMOVED';
  moderationNote?: string | null;
}

export interface AdminStory {
  id: string;
  url: string;
  mediaType: string;
  expiresAt: string;
  createdAt: string;
  user?: {
    profile?: {
      username: string;
      avatar: string | null;
      standardUrl?: string | null;
      thumbnailUrl?: string | null;
    } | null;
  } | null;
  _count?: { views: number; reactions: number };
  moderationStatus: 'VISIBLE' | 'FLAGGED' | 'HIDDEN' | 'REMOVED';
  moderationNote?: string | null;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  isActive: boolean;
  role: string;
  verificationLevel?: 'BASIC' | 'VERIFIED' | 'BUSINESS' | 'ELITE';
  accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  createdAt: string;
  identityVerifiedAt?: string | null;
  stripeIdentitySessionId?: string | null;
  profile?: {
    username: string;
    fullName: string | null;
    avatar: string | null;
    standardUrl?: string | null;
    thumbnailUrl?: string | null;
    bio: string | null;
  } | null;
  posts: {
    id: string;
    caption: string | null;
    createdAt: string;
    type: string;
  }[];
  reports: { id: string; reason: string; status: string; createdAt: string }[];
  _count: { posts: number; followers: number; following: number };
}

export interface AdminAudio {
  id: string;
  title: string;
  artist: string;
  url: string;
  thumbnailUrl?: string | null;
  duration: number;
  createdAt: string;
}

export interface WhitelistEntry {
  id: string;
  email: string;
  name: string | null;
  status: 'PENDING' | 'INVITED' | 'REGISTERED';
  createdAt: string;
  updatedAt: string;
}

export const adminApi = {
  // Stats
  getStats: () => apiClient.get<AdminStats>('admin/stats'),

  getEnhancedStats: () => apiClient.get<EnhancedStats>('admin/stats/enhanced'),

  getActivityChart: () =>
    apiClient.get<ActivityChartDay[]>('admin/stats/activity-chart'),

  getTopUsers: () => apiClient.get<TopUser[]>('admin/stats/top-users'),

  // Users
  getUsers: (page = 1, limit = 50, search = '', status?: string) =>
    apiClient.get<PaginatedResponse<AdminUser>>('admin/users', {
      params: { page, limit, search, status },
    }),

  updateUserStatus: (
    userId: string,
    data: {
      verificationLevel?: string;
      accountType?: string;
      isActive?: boolean;
      role?: string;
    },
  ) => apiClient.patch(`admin/users/${userId}/status`, data),

  getUserDetail: (id: string) =>
    apiClient.get<AdminUserDetail>(`admin/users/${id}/detail`),

  banUser: (id: string) => apiClient.patch(`admin/users/${id}/ban`),

  unbanUser: (id: string) => apiClient.patch(`admin/users/${id}/unban`),

  promoteUser: (id: string) => apiClient.patch(`admin/users/${id}/promote`),

  demoteUser: (id: string) => apiClient.patch(`admin/users/${id}/demote`),

  revokeUserKYC: (id: string) => apiClient.post(`admin/users/${id}/revoke-kyc`),

  deleteUser: (id: string) => apiClient.delete(`admin/users/${id}`),

  exportUsersCSV: () =>
    apiClient.get('admin/users/export', { responseType: 'blob' }),

  // Posts
  getPosts: (page = 1, limit = 10, search?: string, type?: string) =>
    apiClient.get<PaginatedResponse<AdminPost>>('admin/posts', {
      params: { page, limit, search, type },
    }),

  deletePost: (id: string) => apiClient.delete(`admin/posts/${id}`),

  exportPostsCSV: () =>
    apiClient.get('admin/posts/export', { responseType: 'blob' }),

  // Reports
  getReports: (page = 1, limit = 10, search?: string, status?: string) =>
    apiClient.get<PaginatedResponse<AdminReport>>('admin/reports', {
      params: { page, limit, search, status },
    }),

  updateReport: (id: string, status: string) =>
    apiClient.patch(`admin/reports/${id}`, { status }),

  // Audit Logs
  getAuditLogs: (page = 1, limit = 50) =>
    apiClient.get<PaginatedResponse<AuditLogEntry>>(
      `/admin/audit-logs?page=${page}&limit=${limit}`,
    ),

  // Hashtags
  getHashtags: (page = 1, limit = 20, search?: string) =>
    apiClient.get<PaginatedResponse<AdminHashtag>>('admin/hashtags', {
      params: { page, limit, search },
    }),

  // Comments
  getComments: (page = 1, limit = 10, search?: string) =>
    apiClient.get<PaginatedResponse<AdminComment>>('admin/comments', {
      params: { page, limit, search },
    }),

  deleteComment: (id: string) => apiClient.delete(`admin/comments/${id}`),

  // Stories
  getStories: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<AdminStory>>('admin/stories', {
      params: { page, limit },
    }),

  deleteStory: (id: string) => apiClient.delete(`admin/stories/${id}`),

  // Audio
  getAudio: (page = 1, limit = 10, search?: string) =>
    apiClient.get<PaginatedResponse<AdminAudio>>('admin/audio', {
      params: { page, limit, search },
    }),

  createAudio: (data: {
    title: string;
    artist: string;
    url: string;
    thumbnailUrl?: string;
    duration: number;
  }) => apiClient.post<AdminAudio>('admin/audio', data),

  updateAudio: (
    id: string,
    data: {
      title: string;
      artist: string;
      url: string;
      thumbnailUrl?: string;
      duration: number;
    },
  ) => apiClient.patch<AdminAudio>(`admin/audio/${id}`, data),

  deleteAudio: (id: string) => apiClient.delete(`admin/audio/${id}`),

  getWhitelist: (page = 1, limit = 10, search?: string) =>
    apiClient.get<PaginatedResponse<WhitelistEntry>>('admin/whitelist', {
      params: { page, limit, search },
    }),

  updateWhitelist: (id: string, data: Partial<WhitelistEntry>) =>
    apiClient.patch<WhitelistEntry>(`admin/whitelist/${id}`, data),

  deleteWhitelist: (id: string) => apiClient.delete(`admin/whitelist/${id}`),

  getMonetizationAnalytics: () =>
    apiClient.get<{
      activeMRR: number;
      totalSubscriptions: number;
      tierDistribution: {
        PREMIUM: number;
        ELITE: number;
        BUSINESS: number;
      };
      subscriptionGrowth: number;
      activeRetentionRate: number;
    }>('admin/analytics/monetization'),

  // Promotions
  getPromotions: (page = 1, limit = 10, status?: string, search?: string) =>
    apiClient.get('/admin/promotions', {
      params: { page, limit, status, search },
    }),

  updatePromotion: (id: string, status: string, note?: string) =>
    apiClient.patch(`/admin/promotions/${id}`, { status, note }),

  // Communications
  sendBroadcast: (data: {
    subject: string;
    title: string;
    content: string;
    buttonText?: string;
    buttonUrl?: string;
  }) => apiClient.post('admin/broadcast', data),

  // Moderation
  getModerationQueue: (page = 1, limit = 10, type?: string, search?: string) =>
    apiClient.get<PaginatedResponse<AdminPost>>('admin/moderation/queue', {
      params: { page, limit, type, search },
    }),

  updateModerationStatus: (
    type: 'POST' | 'STORY' | 'COMMENT',
    id: string,
    status: 'VISIBLE' | 'HIDDEN' | 'REMOVED',
    note?: string,
  ) => apiClient.patch(`admin/moderation/${type}/${id}`, { status, note }),
};
