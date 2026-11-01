import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { monetizationApi } from './monetization.service';

vi.mock('./api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const reply = (data: unknown) => ({ data }) as never;

describe('monetizationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.get).mockResolvedValue(reply({ ok: true }));
    vi.mocked(apiClient.post).mockResolvedValue(
      reply({ url: 'https://checkout.stripe.com/c/1' }),
    );
  });

  it('sends a tip in integer cents with where to come back to', async () => {
    const res = await monetizationApi.sendTip(
      'profile-9',
      500,
      'https://circlesfera.com/p/1',
      'post-1',
    );

    expect(apiClient.post).toHaveBeenCalledWith('/monetization/tip', {
      receiverId: 'profile-9',
      amountCents: 500,
      returnUrl: 'https://circlesfera.com/p/1',
      postId: 'post-1',
    });
    expect(res).toEqual({ url: 'https://checkout.stripe.com/c/1' });
  });

  it('unlocks posts and stories with the withdrawal consent and without sending a price (the server sets it)', async () => {
    const given = { withdrawalConsent: true } as const;
    await monetizationApi.unlockPost(
      'post-1',
      'https://circlesfera.com/p/1',
      given,
    );
    await monetizationApi.unlockStory(
      'story-1',
      'https://circlesfera.com/',
      given,
    );

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/monetization/unlock', {
      postId: 'post-1',
      returnUrl: 'https://circlesfera.com/p/1',
      withdrawalConsent: true,
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/monetization/unlock-story',
      {
        storyId: 'story-1',
        returnUrl: 'https://circlesfera.com/',
        withdrawalConsent: true,
      },
    );
  });

  it('starts Stripe onboarding and opens the dashboard', async () => {
    await monetizationApi.connectAccount('https://a', 'https://b');
    await monetizationApi.getDashboardLink();

    expect(apiClient.post).toHaveBeenCalledWith('/monetization/connect', {
      returnUrl: 'https://a',
      refreshUrl: 'https://b',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/monetization/dashboard');
  });

  it('opens the session of the tax details panels', async () => {
    await monetizationApi.createTaxDetailsSession();

    expect(apiClient.post).toHaveBeenCalledWith('/monetization/tax-session');
  });

  it('reads what the tax details hold', async () => {
    await monetizationApi.getTaxDetailsStatus();

    expect(apiClient.get).toHaveBeenCalledWith('/monetization/tax-status');
  });

  it('reads status, earnings, transactions, analytics and payouts', async () => {
    await monetizationApi.getStatus();
    await monetizationApi.getMonetization();
    await monetizationApi.getTransactions(2, 50);
    await monetizationApi.getIncomeStats();
    await monetizationApi.getFinancialSummary();
    await monetizationApi.getPersonTotal();
    const payouts = await monetizationApi.getPayouts();

    expect(vi.mocked(apiClient.get).mock.calls.map((c) => c[0])).toEqual([
      '/monetization/status',
      '/monetization',
      '/monetization/transactions',
      '/monetization/analytics/income',
      '/monetization/analytics/summary',
      '/monetization/analytics/total',
      '/monetization/payouts',
    ]);
    expect(apiClient.get).toHaveBeenCalledWith('/monetization/transactions', {
      params: { page: 2, limit: 50 },
    });
    expect(payouts).toEqual({ ok: true });
  });

  it('asks for the first page of transactions by default', async () => {
    await monetizationApi.getTransactions();

    expect(apiClient.get).toHaveBeenCalledWith('/monetization/transactions', {
      params: { page: 1, limit: 20 },
    });
  });
});
