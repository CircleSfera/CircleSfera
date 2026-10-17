import type { WithdrawalConsentGiven } from '../components/payments/WithdrawalConsent';
import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

// Types

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
  geoDistribution: { location: string; count: number }[];
  activityHours: { hour: number; count: number }[];
  insights: {
    // A weekday code (SUNDAY…SATURDAY); none when the week had no likes.
    bestDayToPost: string | null;
    bestHourToPost: number;
    retentionRate: number;
  };
}

// One day of the profile, as the server keeps it.
export interface CreatorChartDay {
  date: string;
  views: number;
  followers: number;
  reach: number;
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
  // Remaining budget in integer cents.
  budgetCents: number;
  dailyBudgetCents?: number | null;
  currency: string;
  status: string;
  startDate: string;
  endDate: string;
  reach: number;
  clicks: number;
  createdAt: string;
  // ISO codes joined by commas; none for everywhere.
  countries?: string | null;
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

// API

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

  createPromotion: (
    data: {
      targetType: string;
      targetId: string;
      budget?: number;
      dailyBudget?: number;
      durationDays: number;
      currency?: string;
      // ISO codes from the closed list; none for everywhere.
      countries?: string[];
    } & WithdrawalConsentGiven,
  ) =>
    apiClient.post<{ url: string; promotionId: string }>(
      'creator/promotions',
      data,
    ),

  trackFrameLoop: (postId: string) =>
    apiClient.post(`analytics/post/${postId}/loop`),

  trackFrameWatch: (postId: string, seconds: number) =>
    // No body: the endpoint reads `seconds` from the query string, and a JSON
    // `null` body is rejected by the server's strict JSON parser (400).
    apiClient.post(`analytics/post/${postId}/watch`, undefined, {
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
      countries?: string[];
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
};
