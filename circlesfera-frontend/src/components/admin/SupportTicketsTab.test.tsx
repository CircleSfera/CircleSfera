import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import SupportTicketsTab from './SupportTicketsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getSupportTickets: vi.fn(),
    updateSupportTicket: vi.fn(),
    escalateSupportTicket: vi.fn(),
    getSupportTicketAccount: vi.fn(),
  },
}));

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1',
  email: 'ana@example.com',
  subject: 'Someone is harassing me',
  message: 'It keeps happening in my comments.',
  status: 'OPEN',
  reply: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  user: { id: 'u-1', email: 'ana@example.com', profile: { username: 'ana' } },
  ...overrides,
});
const page = (data: unknown[]) => ({
  data: {
    data,
    meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
  },
});
const account = {
  userId: 'u-1',
  isActive: true,
  memberSince: '2026-01-01T00:00:00.000Z',
  identityVerified: true,
  plan: {
    name: 'Elite Creator',
    renewsAt: '2026-11-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  },
  payouts: { connected: true, enabled: false },
  profiles: [
    {
      id: 'p-1',
      username: 'ana',
      accountType: 'CREATOR',
      verificationLevel: 'ELITE',
      banned: false,
      suspended: true,
    },
  ],
};

describe('SupportTicketsTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getSupportTicketAccount).mockResolvedValue({
      data: account,
    } as never);
  });

  const open = async (data: unknown[]) => {
    vi.mocked(adminApi.getSupportTickets).mockResolvedValue(
      page(data) as never,
    );
    const rendered = renderWithProviders(
      <SupportTicketsTab onToast={onToast} />,
    );
    fireEvent.click(await screen.findByText('Someone is harassing me'));
    return rendered.i18n!;
  };

  it('hands an open ticket to moderation after a confirmation', async () => {
    vi.mocked(adminApi.escalateSupportTicket).mockResolvedValue({
      data: ticket({ status: 'ESCALATED' }),
    } as never);
    const i18n = await open([ticket()]);

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('admin.support.hand_to_moderation'),
      }),
    );
    expect(adminApi.escalateSupportTicket).not.toHaveBeenCalled();
    expect(
      screen.getByText(i18n.t('admin.support.confirm_escalate_message')),
    ).toBeInTheDocument();

    const confirm = screen.getAllByRole('button', {
      name: i18n.t('admin.support.hand_to_moderation'),
    });
    fireEvent.click(confirm[confirm.length - 1]);

    await waitFor(() =>
      expect(adminApi.escalateSupportTicket).toHaveBeenCalledWith('t-1'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n.t('admin.support.toast_escalated'),
        'success',
      ),
    );
  });

  it('a ticket with moderation cannot be answered, closed or handed over again', async () => {
    const i18n = await open([
      ticket({
        status: 'ESCALATED',
        escalatedReport: { id: 'r-1', status: 'PENDING' },
      }),
    ]);

    expect(
      screen.getByText(i18n.t('admin.support.with_moderation_notice')),
    ).toBeInTheDocument();
    for (const key of ['mark_resolved', 'mark_closed', 'hand_to_moderation']) {
      expect(
        screen.queryByRole('button', { name: i18n.t(`admin.support.${key}`) }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.getByPlaceholderText(i18n.t('admin.support.reply_placeholder')),
    ).toBeDisabled();
  });

  it('goes back to support once moderation has decided', async () => {
    const i18n = await open([
      ticket({
        status: 'ESCALATED',
        escalatedReport: { id: 'r-1', status: 'RESOLVED' },
      }),
    ]);

    expect(
      screen.getByText(i18n.t('admin.support.moderation_decided')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n.t('admin.support.mark_resolved'),
      }),
    ).toBeInTheDocument();
  });

  it('shows the account card of who wrote: plan, payouts and standing', async () => {
    const i18n = await open([ticket()]);

    expect(await screen.findByText('Elite Creator')).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('admin.support.account.payouts_pending')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('admin.support.account.suspended')),
    ).toBeInTheDocument();
    expect(adminApi.getSupportTicketAccount).toHaveBeenCalledWith('t-1');
  });
});
