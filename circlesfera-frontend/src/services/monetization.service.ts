import type { WithdrawalConsentGiven } from '../components/payments/WithdrawalConsent';
import { apiClient as api } from './api';

export interface PersonMoneyTotal {
  totalEarningsCents: number;
  currentMonthEarningsCents: number;
  // Income that names none of the person's Profiles: from before income
  // named its Profile, or from a Profile, post or story since deleted.
  unassignedEarningsCents: number;
  unassignedCurrentMonthEarningsCents: number;
  profiles: {
    profileId: string;
    username: string;
    avatar: string | null;
    accountType: string;
    ownPayoutAccount: boolean;
    earningsCents: number;
    currentMonthEarningsCents: number;
  }[];
}

export const monetizationApi = {
  getStatus: async () => {
    const { data } = await api.get('/monetization/status');
    return data;
  },
  connectAccount: async (returnUrl: string, refreshUrl: string) => {
    const { data } = await api.post('/monetization/connect', {
      returnUrl,
      refreshUrl,
    });
    return data;
  },
  getDashboardLink: async () => {
    const { data } = await api.get('/monetization/dashboard');
    return data;
  },
  // What the tax details panels of the active Profile's own payout account
  // load with.
  createTaxDetailsSession: async (): Promise<{
    clientSecret: string;
    publishableKey: string;
  }> => {
    const { data } = await api.post('/monetization/tax-session');
    return data;
  },
  sendTip: async (
    receiverId: string,
    amountCents: number,
    returnUrl: string,
    postId?: string,
  ) => {
    const { data } = await api.post('/monetization/tip', {
      receiverId,
      amountCents,
      returnUrl,
      postId,
    });
    return data;
  },
  unlockPost: async (
    postId: string,
    returnUrl: string,
    consent: WithdrawalConsentGiven,
  ) => {
    const { data } = await api.post('/monetization/unlock', {
      postId,
      returnUrl,
      ...consent,
    });
    return data;
  },

  unlockStory: async (
    storyId: string,
    returnUrl: string,
    consent: WithdrawalConsentGiven,
  ) => {
    const { data } = await api.post('/monetization/unlock-story', {
      storyId,
      returnUrl,
      ...consent,
    });
    return data;
  },
  getTransactions: async (page = 1, limit = 20) => {
    const { data } = await api.get<{
      data: Array<{
        id: string;
        type: string;
        amountCents?: number;
        amount?: number;
        // Sent by older servers only, with description.
        receiverId?: string;
        // Whether the active Profile received it, rather than the person
        // paid it.
        incoming?: boolean;
        createdAt: string;
        description?: string;
      }>;
    }>('/monetization/transactions', {
      params: { page, limit },
    });
    return data;
  },
  getMonetization: async () => {
    const { data } = await api.get('/monetization');
    return data;
  },
  getIncomeStats: async () => {
    const { data } = await api.get<{ month: string; income: number }[]>(
      '/monetization/analytics/income',
    );
    return data;
  },
  getFinancialSummary: async () => {
    const { data } = await api.get<{
      currentMonthIncome: number;
      totalTips: number;
      breakdown?: {
        postUnlocks: number;
        storyUnlocks: number;
        messageUnlocks: number;
        tips: number;
        liveGifts: number;
      };
    }>('/monetization/analytics/summary');
    return data;
  },
  // The person's total over all their Profiles.
  getPersonTotal: async () => {
    const { data } = await api.get<PersonMoneyTotal>(
      '/monetization/analytics/total',
    );
    return data;
  },
  getPayouts: async () => {
    const { data } = await api.get<{
      available?: { amountCents: number; currency: string }[];
      pending?: { amountCents: number; currency: string }[];
    }>('/monetization/payouts');
    return data;
  },
};
