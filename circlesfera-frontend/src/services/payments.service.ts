import { apiClient as api } from './api';

export const paymentsApi = {
  /** Get all available platform subscription plans. */
  getPlans: async () => {
    const response = await api.get('/payments/plans');
    return response.data;
  },

  /** Create a Stripe Checkout session for a platform plan. */
  createSubscriptionCheckout: async (
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
  ) => {
    const response = await api.post('/payments/checkout', {
      planId,
      billingCycle,
    });
    return response.data; // { url: string }
  },

  /** Get Stripe Customer Portal URL to manage billing. */
  getBillingPortalUrl: async () => {
    const response = await api.get('/payments/portal');
    return response.data; // { url: string }
  },

  /** Download Financial Ledger (CSV) for the current user */
  getLedger: async () => {
    const response = await api.get('/payments/ledger', {
      responseType: 'blob',
    });
    return response.data;
  },

  /** Download Full Financial Ledger (CSV) for Admin */
  getAdminLedger: async () => {
    const response = await api.get('/payments/admin/ledger', {
      responseType: 'blob',
    });
    return response.data;
  },
};
