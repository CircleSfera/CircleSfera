import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

// ─── Types ───────────────────────────────────────────────────────

export interface CreatorStats {
  postCount: number;
  frameCount: number;
  storyCount: number;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  totalComments: number;
  totalBookmarks: number;
  activePromotions: number;
  engagementRate: number;
  followerGrowth: number;
  totalReach: number;
  mrr: number;
  subscriberCount: number;
  geoDistribution: { location: string; count: number }[];
  activityHours: { hour: number; count: number }[];
  retentionStatus: { active: number; churning: number; churned: number };
  insights: {
    bestDayToPost: string;
    bestHourToPost: number;
    retentionRate: number;
  };
}

export interface CreatorChartDay {
  date: string;
  likes: number;
  comments: number;
  views: number;
  followers: number;
}

export interface CreatorPost {
  id: string;
  caption: string | null;
  type: string;
  views: number;
  performanceScore: number;
  createdAt: string;
  media?: { url: string; type?: string }[];
  loops?: number;
  watchTime?: number;
  impressions?: number;
  shares?: number;
  totalDwellTime?: number;
  conversionRate?: number;
  _count: { likes: number; comments: number; bookmarks: number };
}

export interface CreatorStory {
  id: string;
  url: string;
  mediaType: string;
  expiresAt: string;
  createdAt: string;
  _count: { views: number; reactions: number };
}

export interface CreatorPromotion {
  id: string;
  targetType: string;
  targetId: string;
  budget: number;
  currency: string;
  status: string;
  startDate: string;
  endDate: string;
  reach: number;
  createdAt: string;
  refundPolicy?: string;
  refundedAt?: string | null;
  target?: {
    caption?: string | null;
    thumbnail?: string | null;
    type?: string;
  } | null;
}

export interface CancelPromotionResult extends CreatorPromotion {
  refund?: {
    amount: number;
    currency: string;
    status: string;
  };
}

// ─── API ─────────────────────────────────────────────────────────

export const creatorApi = {
  getStats: () => apiClient.get<CreatorStats>('creator/stats'),

  getActivityChart: () =>
    apiClient.get<CreatorChartDay[]>('creator/activity-chart'),

  getPosts: (page = 1, limit = 10, type?: string) =>
    apiClient.get<PaginatedResponse<CreatorPost>>('creator/posts', {
      params: { page, limit, type },
    }),

  getStories: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<CreatorStory>>('creator/stories', {
      params: { page, limit },
    }),

  getPromotions: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<CreatorPromotion>>('creator/promotions', {
      params: { page, limit },
    }),

  getPostInsights: (postId: string) =>
    apiClient.get<{
      post: CreatorPost;
      chart: { date: string; views: number }[];
    }>(`analytics/post/${postId}/insights`),

  recordPromotionView: (promotionId: string) =>
    apiClient.post<{ success: boolean }>(
      `/creator/promotions/${promotionId}/view`,
    ),

  createPromotion: (data: {
    targetType: string;
    targetId: string;
    budget?: number;
    dailyBudget?: number;
    durationDays: number;
    currency?: string;
    objective?: string;
    interests?: string;
    countries?: string;
  }) =>
    apiClient.post<{ url: string; promotionId: string }>(
      'creator/promotions',
      data,
    ),

  trackFrameLoop: (postId: string) =>
    apiClient.post(`analytics/post/${postId}/loop`),

  trackFrameWatch: (postId: string, seconds: number) =>
    apiClient.post(`analytics/post/${postId}/watch`, null, {
      params: { seconds },
    }),

  cancelPromotion: (id: string) =>
    apiClient.delete<CancelPromotionResult>(`creator/promotions/${id}`),

  pausePromotion: (id: string) =>
    apiClient.post<CreatorPromotion>(`creator/promotions/${id}/pause`),

  resumePromotion: (id: string) =>
    apiClient.post<CreatorPromotion>(`creator/promotions/${id}/resume`),

  updatePromotion: (
    id: string,
    data: {
      objective?: string;
      interests?: string;
      countries?: string;
      endDate?: string;
      dailyBudget?: number;
    },
  ) => apiClient.patch(`creator/promotions/${id}`, data),

  getRevenueAnalytics: (period = '30d') =>
    apiClient.get<{
      period: string;
      grossRevenue: number;
      subscriptionsTotal: number;
      tipsTotal: number;
      postUnlocksTotal: number;
      giftsTotal: number;
      activeSubscribersCount: number;
      totalFollowersCount: number;
      conversionRate: number;
      currency: string;
    }>('creator/analytics/revenue', { params: { period } }),

  getAudienceRetentionAnalytics: () =>
    apiClient.get<{
      avgDwellSeconds: number;
      totalInteractionsSampled: number;
      peakActivityHourUTC: number;
      hourlyDistribution: number[];
    }>('creator/analytics/retention'),

  getTopPerformingContent: (limit = 5) =>
    apiClient.get<
      {
        id: string;
        caption: string | null;
        views: number;
        performanceScore: number;
        likes: number;
        comments: number;
        bookmarks: number;
        thumbnailUrl: string | null;
        createdAt: string;
      }[]
    >('creator/analytics/top-posts', { params: { limit } }),

  exportAnalyticsCsv: (period = '30d') =>
    apiClient.get<string>('creator/analytics/export', {
      params: { period },
      responseType: 'text' as unknown as undefined,
    }),

  // Creator subscriptions
  getMyCreatorSubscriptions: () => apiClient.get('creator/subscriptions/me'),

  checkCreatorSubscription: (creatorId: string) =>
    apiClient.get(`creator/subscription/${creatorId}`),

  cancelCreatorSubscription: (creatorId: string) =>
    apiClient.delete(`creator/subscription/${creatorId}`),
};
