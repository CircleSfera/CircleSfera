import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import SpamReviewTab from './SpamReviewTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getRiskCases: vi.fn(),
    getRiskCaseStats: vi.fn(),
    resolveRiskCase: vi.fn(),
  },
}));

vi.mock('./adminToast', () => ({ adminToast: vi.fn() }));

import { adminApi } from '../../services/admin.service';

const riskCase = {
  id: 'case-1',
  profileId: 'p-1',
  score: 75,
  signals: [
    { key: 'velocity', points: 25, value: 60 },
    { key: 'coordinatedText', points: 25, value: 3 },
  ],
  status: 'OPEN',
  restrictedUntil: '2026-10-08T10:00:00.000Z',
  decision: null,
  reviewedAt: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  profile: {
    id: 'p-1',
    username: 'spammy',
    fullName: null,
    avatar: null,
    userId: 'u-1',
  },
  reviewedBy: null,
};

describe('SpamReviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getRiskCases).mockResolvedValue({
      data: [riskCase],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    } as never);
    vi.mocked(adminApi.getRiskCaseStats).mockResolvedValue({
      open: 1,
      reviewedLast90Days: 4,
      actionedLast90Days: 3,
      dismissedLast90Days: 1,
      precision: 0.75,
    });
  });

  it('lists open cases with their score, explained signals and restriction', async () => {
    const { i18n } = renderWithProviders(<SpamReviewTab />);

    expect(await screen.findByText('@spammy')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('admin.spam_review.score', { score: 75 })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(
          i18n!
            .t('admin.spam_review.signal.velocity', { value: 60 })
            .replace(/[()]/g, '.'),
        ),
      ),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('spam-review-stats')).toHaveTextContent(
      '75%',
    );
    expect(adminApi.getRiskCases).toHaveBeenCalledWith('OPEN', 1);
  });

  it('records the staff decision with an optional note', async () => {
    vi.mocked(adminApi.resolveRiskCase).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<SpamReviewTab />);
    const label = i18n!.t('admin.spam_review.decision.RESTRICTED');

    fireEvent.click(await screen.findByRole('button', { name: label }));
    const buttons = await screen.findAllByRole('button', { name: label });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(adminApi.resolveRiskCase).toHaveBeenCalledWith(
        'case-1',
        'RESTRICTED',
        undefined,
      );
    });
  });
});
