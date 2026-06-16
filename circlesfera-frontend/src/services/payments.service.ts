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

  /** Get URL for the Stripe Customer Portal. */
  getBillingPortalUrl: async () => {
    const response = await api.get('/payments/portal');
    return response.data; // { url: string }
  },

  /** Create an Identity Verification Session. */
  createIdentitySession: async (returnUrl: string) => {
    const response = await api.post('/payments/identity-session', {
      returnUrl,
    });
    return response.data; // { url: string }
  },
};
