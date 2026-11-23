import type { WithdrawalConsentGiven } from '../components/payments/WithdrawalConsent';
import { apiClient as api } from './api';

export const paymentsApi = {
  // Get all available platform subscription plans.
  getPlans: async () => {
    const response = await api.get('/payments/plans');
    return response.data;
  },

  // Create a Stripe Checkout session for a platform plan.
  createSubscriptionCheckout: async (
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY',
    consent: WithdrawalConsentGiven,
  ) => {
    const response = await api.post('/payments/checkout', {
      planId,
      billingCycle,
      ...consent,
    });
    return response.data; // { url: string }
  },

  // Get Stripe Customer Portal URL to manage billing.
  getBillingPortalUrl: async () => {
    const response = await api.get('/payments/portal');
    return response.data; // { url: string }
  },

  // Cancels the plan of the profile in use at the end of the period paid;
  // answers the billing status after it.
  cancelPlan: async () => {
    const response = await api.post('/payments/plan/cancel');
    return response.data;
  },

  // Takes back the cancellation of the plan of the profile in use while it
  // lasts; answers the billing status after it.
  resumePlan: async () => {
    const response = await api.post('/payments/plan/resume');
    return response.data;
  },

  // The same for the Edits Studio Pro add-on of the profile in use, kept
  // apart from its plan.
  cancelStudioPro: async () => {
    const response = await api.post('/payments/plan/studio-pro/cancel');
    return response.data;
  },

  resumeStudioPro: async () => {
    const response = await api.post('/payments/plan/studio-pro/resume');
    return response.data;
  },

  // Moves the monthly plan of the profile in use to its yearly price: the
  // rest of the month is credited and the year starts today. Answers the
  // billing status after it, with `paymentUrl` when the charge waits for the
  // person on the provider's page.
  switchPlanToYearly: async (consent: WithdrawalConsentGiven) => {
    const response = await api.post('/payments/plan/yearly', consent);
    return response.data;
  },

  // Withdraws from the plan of the profile in use within 14 days of buying
  // it: it ends now and the unused part is refunded; answers the billing
  // status after it.
  withdrawPlan: async () => {
    const response = await api.post('/payments/plan/withdraw');
    return response.data;
  },

  withdrawStudioPro: async () => {
    const response = await api.post('/payments/plan/studio-pro/withdraw');
    return response.data;
  },

  // Get billing status for the current user
  getBillingStatus: async () => {
    const response = await api.get('/payments/status');
    return response.data;
  },

  // Download Financial Ledger (CSV) for the current user
  getLedger: async () => {
    const response = await api.get('/payments/ledger', {
      responseType: 'blob',
    });
    return response.data;
  },

  // Download Full Financial Ledger (CSV) for Admin
  getAdminLedger: async () => {
    const response = await api.get('/payments/admin/ledger', {
      responseType: 'blob',
    });
    return response.data;
  },
};
