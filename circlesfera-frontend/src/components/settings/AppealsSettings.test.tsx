import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AppealsSettings from './AppealsSettings';

vi.mock('../../services/appeals.service', () => ({
  createAppeal: vi.fn(),
  getMyAppeals: vi.fn(),
  getMyStrikes: vi.fn(),
}));

import {
  createAppeal,
  getMyAppeals,
  getMyStrikes,
  type ProfileStrike,
} from '../../services/appeals.service';

const strike = (overrides: Partial<ProfileStrike>): ProfileStrike => ({
  id: 'strike-1',
  kind: 'STRIKE',
  reason: 'HARASSMENT',
  consequence: 'NONE',
  createdAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-11-30T00:00:00.000Z',
  revokedAt: null,
  status: 'ACTIVE',
  ...overrides,
});

describe('AppealsSettings profile standing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMyAppeals).mockResolvedValue([]);
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('shows an empty standing when the Profile has no warnings or strikes', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.appeals.strikes_empty')),
    ).toBeInTheDocument();
  });

  it('counts only active strikes, not warnings or expired ones', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([
      strike({ id: 's-1' }),
      strike({ id: 's-2', kind: 'WARNING' }),
      strike({ id: 's-3', status: 'EXPIRED' }),
      strike({
        id: 's-4',
        status: 'REVOKED',
        revokedAt: '2026-09-10T00:00:00.000Z',
      }),
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(await screen.findByTestId('active-strike-count')).toHaveTextContent(
      i18n!.t('settings.appeals.strikes_active_count', { count: 1 }),
    );
    expect(screen.getAllByTestId('strike-row')).toHaveLength(4);
    expect(
      screen.getByText(i18n!.t('settings.appeals.strike_status_revoked')),
    ).toBeInTheDocument();
    // Only active records can be appealed.
    expect(
      screen.getAllByRole('button', {
        name: i18n!.t('settings.appeals.strike_appeal'),
      }),
    ).toHaveLength(2);
  });

  it('shows the consequence a strike caused', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([
      strike({ consequence: 'SUSPENDED' }),
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    expect(
      await screen.findByText(
        i18n!.t('settings.appeals.strike_consequence_suspended'),
      ),
    ).toBeInTheDocument();
  });

  it('appealing a strike files a STRIKE appeal about that record', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([strike({ id: 'strike-9' })]);
    vi.mocked(createAppeal).mockResolvedValue({ id: 'appeal-1' } as never);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.appeals.strike_appeal'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('settings.appeals.reason')),
      { target: { value: 'I did not harass anyone in that thread' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.appeals.submit') }),
    );

    await waitFor(() => {
      expect(createAppeal).toHaveBeenCalled();
    });
    expect(vi.mocked(createAppeal).mock.calls[0][0]).toEqual({
      targetType: 'STRIKE',
      targetId: 'strike-9',
      reason: 'I did not harass anyone in that thread',
    });
  });

  it('hides the appeal action while an appeal about the strike is pending', async () => {
    vi.mocked(getMyStrikes).mockResolvedValue([strike({ id: 'strike-9' })]);
    vi.mocked(getMyAppeals).mockResolvedValue([
      {
        id: 'appeal-1',
        userId: 'u-1',
        targetType: 'STRIKE',
        targetId: 'strike-9',
        reason: 'Pending review of this strike',
        status: 'PENDING',
        adminNotes: null,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const { i18n } = renderWithProviders(<AppealsSettings />);

    await screen.findAllByTestId('strike-row');
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: i18n!.t('settings.appeals.strike_appeal'),
        }),
      ).not.toBeInTheDocument();
    });
  });
});
