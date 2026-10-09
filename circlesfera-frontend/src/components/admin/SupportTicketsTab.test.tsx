import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    getSupportTicket: vi.fn(),
    addSupportMessage: vi.fn(),
  },
}));

const ticket = (overrides: Record<string, unknown> = {}) => ({
  id: 't-1',
  email: 'ana@example.com',
  subject: 'Someone is harassing me',
  message: 'It keeps happening in my comments.',
  status: 'OPEN',
  category: 'PAYMENTS',
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

const message = (overrides: Record<string, unknown>) => ({
  id: 'm-1',
  authorKind: 'REQUESTER',
  authorRef: 'u-1',
  visibility: 'PUBLIC',
  body: 'It keeps happening in my comments.',
  channel: 'PRODUCT',
  createdAt: '2026-09-01T10:00:00.000Z',
  ...overrides,
});
const conversation = [
  message({}),
  message({
    id: 'm-2',
    authorKind: 'AGENT',
    authorRef: 'admin-1',
    visibility: 'INTERNAL',
    body: 'Third time they write about this.',
  }),
];

describe('SupportTicketsTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getSupportTicketAccount).mockResolvedValue({
      data: account,
    } as never);
    vi.mocked(adminApi.getSupportTicket).mockResolvedValue({
      data: { ...ticket(), messages: conversation },
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
    // No answer can be sent; a note for the team still can.
    expect(
      screen.queryByPlaceholderText(i18n.t('admin.support.reply_placeholder')),
    ).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(i18n.t('admin.support.note_placeholder')),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: i18n.t('admin.support.save_note') }),
    ).toBeInTheDocument();
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

  it('says how long an open ticket has waited, and not for a closed one', async () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000 - 60_000,
    ).toISOString();
    vi.mocked(adminApi.getSupportTickets).mockResolvedValue(
      page([
        ticket({ id: 't-old', createdAt: threeDaysAgo }),
        ticket({ id: 't-done', status: 'RESOLVED', createdAt: threeDaysAgo }),
      ]) as never,
    );
    renderWithProviders(<SupportTicketsTab onToast={onToast} />);

    expect(await screen.findAllByText('Waiting 3 days')).toHaveLength(1);
  });

  it('shows what each ticket is about and filters by it', async () => {
    vi.mocked(adminApi.getSupportTickets).mockResolvedValue(
      page([ticket()]) as never,
    );
    renderWithProviders(<SupportTicketsTab onToast={onToast} />);

    expect(await screen.findByText('Payments and plans')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Topic' }), {
      target: { value: 'ACCOUNT' },
    });

    await waitFor(() =>
      expect(adminApi.getSupportTickets).toHaveBeenLastCalledWith(
        1,
        20,
        undefined,
        'ACCOUNT',
      ),
    );
  });

  it('shows the whole conversation, with internal notes marked as such', async () => {
    const i18n = await open([ticket()]);

    const list = await screen.findByRole('region', {
      name: i18n.t('admin.support.conversation'),
    });
    const items = await within(list).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('@ana');
    expect(items[0]).toHaveTextContent('It keeps happening in my comments.');
    expect(items[1]).toHaveTextContent(i18n.t('admin.support.author_team'));
    expect(items[1]).toHaveTextContent(i18n.t('admin.support.internal_note'));
    expect(items[0]).not.toHaveTextContent(
      i18n.t('admin.support.internal_note'),
    );
  });

  it('sends an answer and leaves the ticket as the agent chose', async () => {
    vi.mocked(adminApi.addSupportMessage).mockResolvedValue({
      data: ticket(),
    } as never);
    const i18n = await open([ticket()]);

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t('admin.support.reply_placeholder')),
      { target: { value: '  We are looking into it.  ' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: i18n.t('admin.support.leave_as') }),
      { target: { value: 'OPEN' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('admin.support.send_answer') }),
    );

    await waitFor(() =>
      expect(adminApi.addSupportMessage).toHaveBeenCalledWith('t-1', {
        body: 'We are looking into it.',
        visibility: 'PUBLIC',
        status: 'OPEN',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        i18n.t('admin.support.toast_answered'),
        'success',
      ),
    );
  });

  it('saves an internal note without a state and without sending anything to the person', async () => {
    vi.mocked(adminApi.addSupportMessage).mockResolvedValue({
      data: ticket(),
    } as never);
    const i18n = await open([ticket()]);

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('admin.support.kind_note') }),
    );
    expect(
      screen.getByText(i18n.t('admin.support.note_hint')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', {
        name: i18n.t('admin.support.leave_as'),
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t('admin.support.note_placeholder')),
      { target: { value: 'Checked the payment.' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('admin.support.save_note') }),
    );

    await waitFor(() =>
      expect(adminApi.addSupportMessage).toHaveBeenCalledWith('t-1', {
        body: 'Checked the payment.',
        visibility: 'INTERNAL',
      }),
    );
  });

  it('keeps the send button off until something is written', async () => {
    const i18n = await open([ticket()]);

    expect(
      screen.getByRole('button', { name: i18n.t('admin.support.send_answer') }),
    ).toBeDisabled();
  });

  it('writes what the system noted in the agent language', async () => {
    vi.mocked(adminApi.getSupportTicket).mockResolvedValue({
      data: {
        ...ticket(),
        messages: [
          message({
            id: 'm-9',
            authorKind: 'SYSTEM',
            authorRef: null,
            visibility: 'INTERNAL',
            body: 'handover.decided:REJECTED',
          }),
        ],
      },
    } as never);
    const i18n = await open([ticket()]);

    expect(
      await screen.findByText(i18n.t('admin.support.system.handover_REJECTED')),
    ).toBeInTheDocument();
    expect(screen.queryByText('handover.decided:REJECTED')).toBeNull();
    expect(
      screen.getByText(i18n.t('admin.support.author_system')),
    ).toBeInTheDocument();
  });

  it('sends an answer that leaves the ticket waiting for the requester', async () => {
    vi.mocked(adminApi.addSupportMessage).mockResolvedValue({
      data: ticket(),
    } as never);
    const i18n = await open([ticket()]);

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t('admin.support.reply_placeholder')),
      { target: { value: 'Which day was it?' } },
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: i18n.t('admin.support.leave_as') }),
      { target: { value: 'WAITING' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('admin.support.send_answer') }),
    );

    await waitFor(() =>
      expect(adminApi.addSupportMessage).toHaveBeenCalledWith('t-1', {
        body: 'Which day was it?',
        visibility: 'PUBLIC',
        status: 'WAITING',
      }),
    );
  });

  it('names the waiting state in the list', async () => {
    const i18n = await open([ticket({ status: 'WAITING' })]);

    expect(
      screen.getAllByText(i18n.t('admin.support.status_waiting')).length,
    ).toBeGreaterThan(0);
  });
});
