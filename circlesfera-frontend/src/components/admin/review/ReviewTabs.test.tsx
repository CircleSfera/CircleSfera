import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewApi } from '../../../services/review.service';
import { useAdminAuthStore } from '../../../stores/adminAuthStore';
import { renderWithProviders } from '../../../test/test-utils';
import ReviewBusinessTab from './ReviewBusinessTab';
import ReviewComplianceTab from './ReviewComplianceTab';
import { total } from './ReviewShared';

vi.mock('../../../services/review.service', () => ({
  reviewApi: {
    summary: vi.fn(),
    enforcement: vi.fn(),
  },
}));

const page = (data: unknown[], extra: Record<string, number> = {}) => ({
  data: {
    data,
    meta: { page: 1, limit: 20, total: data.length, totalPages: 1, ...extra },
  },
});
const summary = (overrides: Record<string, unknown> = {}) => ({
  data: {
    days: 30,
    payments: [
      {
        type: 'STRIPE_SUBSCRIPTION',
        status: 'COMPLETED',
        count: 3,
        amountCents: 1500,
        refundedCents: 0,
      },
      {
        type: 'PROMOTION_PAYMENT',
        status: 'REFUNDED',
        count: 1,
        amountCents: 500,
        refundedCents: 500,
      },
      {
        type: 'PROMOTION_PAYMENT',
        status: 'PENDING',
        count: 4,
        amountCents: 2000,
        refundedCents: 0,
      },
    ],
    disputes: { needs_response: 1 },
    reports: { PENDING: 2, RESOLVED: 5, REJECTED: 1 },
    strikes: { NONE: 3, SUSPENDED: 1 },
    appeals: { APPROVED: 1, REJECTED: 2 },
    illegalContentNotices: { ACTIONED: 2, NO_ACTION: 1 },
    ...overrides,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  useAdminAuthStore.setState({
    admin: {
      id: 'rev-1',
      email: 'stripereview@circlesfera.com',
      displayName: 'Stripe review',
      totpEnabled: false,
      roles: ['EXTERNAL_REVIEWER'],
      permissions: ['review'],
      externalReviewer: true,
      accessExpiresAt: '2026-12-31T00:00:00.000Z',
    },
    isAuthenticated: true,
  });
  vi.mocked(reviewApi.summary).mockResolvedValue(summary() as never);
});

describe('review totals', () => {
  it('adds the counts, or those of the states named', () => {
    expect(total({ A: 1, B: 2 })).toBe(3);
    expect(total({ A: 1, B: 2 }, ['B'])).toBe(2);
    expect(total(undefined)).toBe(0);
  });
});

describe('ReviewComplianceTab', () => {
  it('says it is read only, until when, and links the public rules', async () => {
    vi.mocked(reviewApi.enforcement).mockResolvedValue(page([]) as never);
    renderWithProviders(<ReviewComplianceTab />);

    expect(
      await screen.findByText(/Read only\. Creators appear/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your review access ends on/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Community Guidelines' }),
    ).toHaveAttribute('href', expect.stringMatching(/\/guidelines$/));
    expect(
      screen.getByRole('link', { name: 'Terms of Service' }),
    ).toHaveAttribute('target', '_blank');
  });

  it('counts the last weeks of enforcement', async () => {
    vi.mocked(reviewApi.enforcement).mockResolvedValue(page([]) as never);
    renderWithProviders(<ReviewComplianceTab />);

    expect(await screen.findByText('Last 30 days')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('6 decided')).toBeInTheDocument();
    expect(screen.getByText('1 with a suspension or ban')).toBeInTheDocument();
    expect(screen.getByText('1 upheld')).toBeInTheDocument();
    expect(screen.getByText('2 acted on')).toBeInTheDocument();
  });

  it('lists reports with their category and outcome, never who reported', async () => {
    vi.mocked(reviewApi.enforcement).mockResolvedValue(
      page([
        {
          id: 'r-1',
          createdAt: '2026-11-01T10:00:00.000Z',
          reason: 'HATE_SPEECH',
          targetType: 'POST',
          status: 'RESOLVED',
          urgent: true,
          resolvedAt: '2026-11-02T10:00:00.000Z',
        },
      ]) as never,
    );
    renderWithProviders(<ReviewComplianceTab />);

    expect(await screen.findByText('Hate speech')).toBeInTheDocument();
    expect(screen.getByText('Post')).toBeInTheDocument();
    expect(screen.getByText('Acted on')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText(/^Decided/)).toBeInTheDocument();
    expect(reviewApi.enforcement).toHaveBeenCalledWith({
      kind: 'reports',
      page: 1,
      limit: 20,
    });
  });

  it('lists strikes, appeals and notices from their own tabs', async () => {
    vi.mocked(reviewApi.enforcement).mockImplementation((async ({
      kind,
    }: {
      kind: string;
    }) =>
      kind === 'strikes'
        ? page([
            {
              id: 's-1',
              createdAt: '2026-11-01T00:00:00.000Z',
              kind: 'STRIKE',
              reason: 'SPAM',
              consequence: 'SUSPENDED',
              expiresAt: '2027-01-30T00:00:00.000Z',
              revokedAt: null,
              username: 'ana',
            },
            {
              id: 's-2',
              createdAt: '2026-11-01T00:00:00.000Z',
              kind: 'WARNING',
              reason: 'OTHER',
              consequence: 'NONE',
              expiresAt: '2027-01-30T00:00:00.000Z',
              revokedAt: '2026-11-03T00:00:00.000Z',
              username: 'bea',
            },
          ])
        : kind === 'appeals'
          ? page([
              {
                id: 'a-1',
                createdAt: '2026-11-01T00:00:00.000Z',
                targetType: 'POST_REMOVAL',
                status: 'APPROVED',
                resolvedAt: '2026-11-04T00:00:00.000Z',
              },
            ])
          : kind === 'notices'
            ? page([
                {
                  id: 'n-1',
                  createdAt: '2026-11-01T00:00:00.000Z',
                  childAbuse: true,
                  status: 'ACTIONED',
                  decidedAt: '2026-11-01T05:00:00.000Z',
                },
              ])
            : page([])) as never);
    renderWithProviders(<ReviewComplianceTab />);
    await screen.findByText('Nothing here yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Strikes' }));
    expect(await screen.findByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('Profile suspended')).toBeInTheDocument();
    expect(screen.getByText(/^Expires/)).toBeInTheDocument();
    expect(screen.getByText(/^Withdrawn/)).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Appeals' }));
    expect(await screen.findByText('Post removal')).toBeInTheDocument();
    expect(screen.getByText('Upheld')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Notices' }));
    expect(
      await screen.findByText('Reports child sexual abuse'),
    ).toBeInTheDocument();
    expect(reviewApi.enforcement).toHaveBeenLastCalledWith({
      kind: 'notices',
      page: 1,
      limit: 20,
    });
  });

  it('says so when it cannot load', async () => {
    vi.mocked(reviewApi.enforcement).mockRejectedValue(new Error('down'));
    renderWithProviders(<ReviewComplianceTab />);
    expect(
      await screen.findByText(
        'This could not be loaded. Try again in a moment.',
      ),
    ).toBeInTheDocument();
  });
});

describe('ReviewBusinessTab', () => {
  it('counts the money of the last weeks, payments not made left out', async () => {
    renderWithProviders(<ReviewBusinessTab />);

    expect(await screen.findByText('Last 30 days')).toBeInTheDocument();
    // A pending payment is not money made.
    expect(
      screen.getByText('4 payments', { selector: 'span' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 dispute')).toBeInTheDocument();
  });

  it('shows the payments by kind and state, in totals', async () => {
    renderWithProviders(<ReviewBusinessTab />);

    expect(await screen.findByText('Platform plans')).toBeInTheDocument();
    expect(screen.getAllByText('Promotions').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Refunded', { selector: 'div' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/refunded$/)).toBeInTheDocument();
  });

  it('says when there are no payments, or they cannot load', async () => {
    vi.mocked(reviewApi.summary).mockResolvedValue(
      summary({ payments: [] }) as never,
    );
    const first = renderWithProviders(<ReviewBusinessTab />);
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
    first.unmount();

    vi.mocked(reviewApi.summary).mockRejectedValue(new Error('down'));
    renderWithProviders(<ReviewBusinessTab />);
    const failed = await screen.findAllByText(
      'This could not be loaded. Try again in a moment.',
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(within(document.body).queryByText('Last 30 days')).toBeNull();
  });
});
