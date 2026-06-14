import type { PaginatedResponse } from '../types';
import { apiClient as api } from './api';

export interface MonetizationStatus {
  id: string;
  userId: string;
  lifetimeEarningsCents: number;
  hasStripeAccount: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  sender?: { id: string; profile: { username: string; avatar: string | null } };
  receiver?: { id: string; profile: { username: string; avatar: string | null } };
}

export const monetizationApi = {
  getStatus: async (): Promise<MonetizationStatus> => {
    const res = await api.get('/monetization');
    return res.data;
  },

  getTransactions: async (page = 1, limit = 20): Promise<PaginatedResponse<Transaction>> => {
    const res = await api.get('/monetization/transactions', { params: { page, limit } });
    return res.data;
  },

  connectStripe: async (returnUrl: string, refreshUrl: string): Promise<{ url: string }> => {
    const res = await api.post('/monetization/connect', { returnUrl, refreshUrl });
    return res.data;
  },

  getDashboardLink: async (): Promise<{ url: string }> => {
    const res = await api.get('/monetization/dashboard');
    return res.data;
  },

  tipCreator: async (receiverId: string, amountCents: number, returnUrl: string, postId?: string): Promise<{ url: string }> => {
    const res = await api.post('/monetization/tip', { receiverId, amountCents, returnUrl, postId });
    return res.data;
  },

  unlockPost: async (postId: string, returnUrl: string): Promise<{ url: string }> => {
    const res = await api.post('/monetization/unlock', { postId, returnUrl });
    return res.data;
  },
};
