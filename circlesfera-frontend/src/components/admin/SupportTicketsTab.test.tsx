import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import SupportTicketsTab from './SupportTicketsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getSupportTickets: vi.fn(),
    updateSupportTicket: vi.fn(),
    escalateSupportTicket: vi.fn(),
    getSupportTicketAccount: vi.fn(),
    getSupportTicket: vi.fn(),
    assignSupportTicket: vi.fn(),
    getSupportAgents: vi.fn(),
    addSupportMessage: vi.fn(),
  },
}));

// An agent who answers tickets and does not lead the team.
const agentOne = {
  id: 'admin-1',
  roles: ['SUPPORT_ADMIN'],
  permissions: ['support'],
};

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
        {},
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

  describe('when someone else writes while the agent writes', () => {
    const theirs = message({
      id: 'm-3',
      authorKind: 'AGENT',
      authorRef: 'admin-2',
      body: 'I already told them how to block the account.',
      createdAt: '2026-09-01T11:00:00.000Z',
    });
    const withTheirs = {
      data: { ...ticket(), messages: [...conversation, theirs] },
    } as never;

    // Opens the ticket, waits for its conversation and starts an answer.
    const startWriting = async () => {
      vi.mocked(adminApi.addSupportMessage).mockResolvedValue({
        data: ticket(),
      } as never);
      const i18n = await open([ticket()]);
      await screen.findByText('Third time they write about this.');
      fireEvent.change(
        screen.getByPlaceholderText(i18n.t('admin.support.reply_placeholder')),
        { target: { value: 'Block the account from its page.' } },
      );
      return {
        i18n,
        sendButton: () =>
          screen.getByRole('button', {
            name: i18n.t('admin.support.send_answer'),
          }),
      };
    };

    it('sends nothing when a message has just arrived: it shows it and asks to read it first', async () => {
      const { i18n, sendButton } = await startWriting();
      vi.mocked(adminApi.getSupportTicket).mockResolvedValue(withTheirs);

      fireEvent.click(sendButton());

      const warning = await screen.findByRole('status');
      expect(warning).toHaveTextContent(
        i18n.t('admin.support.new_message_title'),
      );
      expect(
        screen.getByText('I already told them how to block the account.'),
      ).toBeInTheDocument();
      expect(sendButton()).toBeDisabled();
      expect(adminApi.addSupportMessage).not.toHaveBeenCalled();
    });

    it('sends once the agent has read it, with what they had written', async () => {
      const { i18n, sendButton } = await startWriting();
      vi.mocked(adminApi.getSupportTicket).mockResolvedValue(withTheirs);
      fireEvent.click(sendButton());

      fireEvent.click(
        within(await screen.findByRole('status')).getByRole('button', {
          name: i18n.t('admin.support.new_message_read'),
        }),
      );

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(sendButton()).toBeEnabled();
      fireEvent.click(sendButton());
      await waitFor(() =>
        expect(adminApi.addSupportMessage).toHaveBeenCalledWith(
          't-1',
          expect.objectContaining({ body: 'Block the account from its page.' }),
        ),
      );
    });

    it('reads the ticket again before sending, and sends when nothing is new', async () => {
      const { sendButton } = await startWriting();
      const readings = vi.mocked(adminApi.getSupportTicket).mock.calls.length;

      fireEvent.click(sendButton());

      await waitFor(() =>
        expect(adminApi.addSupportMessage).toHaveBeenCalledTimes(1),
      );
      expect(
        vi.mocked(adminApi.getSupportTicket).mock.calls.length,
      ).toBeGreaterThan(readings);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('reads the ticket again by itself while there is text, and warns', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { sendButton } = await startWriting();
        vi.mocked(adminApi.getSupportTicket).mockResolvedValue(withTheirs);

        await vi.advanceTimersByTimeAsync(20_000);

        expect(await screen.findByRole('status')).toBeInTheDocument();
        expect(sendButton()).toBeDisabled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('writes what changed in the ticket between the messages, in the order it happened', async () => {
    useAdminAuthStore.setState({ admin: agentOne as never });
    const event = (overrides: Record<string, unknown>) => ({
      actorKind: 'AGENT',
      actorRef: 'admin-1',
      fromValue: null,
      toValue: null,
      ...overrides,
    });
    vi.mocked(adminApi.getSupportTickets).mockResolvedValue(
      page([ticket()]) as never,
    );
    vi.mocked(adminApi.getSupportTicket).mockResolvedValue({
      data: {
        ...ticket(),
        agents: { 'admin-1': 'Ana', 'admin-2': 'Ben' },
        messages: [
          message({}),
          message({
            id: 'm-2',
            authorKind: 'AGENT',
            authorRef: 'admin-1',
            body: 'Which email do you use?',
            createdAt: '2026-09-02T10:00:00.000Z',
          }),
        ],
        events: [
          // Written with the answer: it comes right after it.
          event({
            id: 'e-3',
            kind: 'STATE',
            fromValue: 'OPEN',
            toValue: 'WAITING',
            createdAt: '2026-09-02T10:00:00.000Z',
          }),
          event({
            id: 'e-1',
            kind: 'ASSIGNMENT',
            toValue: 'admin-1',
            createdAt: '2026-09-01T11:00:00.000Z',
          }),
          event({
            id: 'e-2',
            kind: 'PRIORITY',
            fromValue: 'NORMAL',
            toValue: 'HIGH',
            actorRef: 'admin-2',
            createdAt: '2026-09-01T12:00:00.000Z',
          }),
          event({
            id: 'e-4',
            kind: 'TOPIC',
            fromValue: 'OTHER',
            toValue: 'PAYMENTS',
            actorRef: null,
            createdAt: '2026-09-03T10:00:00.000Z',
          }),
          event({
            id: 'e-5',
            kind: 'STATE',
            fromValue: 'WAITING',
            toValue: 'OPEN',
            actorKind: 'REQUESTER',
            actorRef: 'u-1',
            createdAt: '2026-09-04T10:00:00.000Z',
          }),
          event({
            id: 'e-6',
            kind: 'HANDOVER',
            toValue: 'r-1',
            createdAt: '2026-09-05T10:00:00.000Z',
          }),
          event({
            id: 'e-7',
            kind: 'STATE',
            fromValue: 'ESCALATED',
            toValue: 'OPEN',
            actorKind: 'SYSTEM',
            actorRef: null,
            createdAt: '2026-09-06T10:00:00.000Z',
          }),
        ],
      },
    } as never);
    renderWithProviders(<SupportTicketsTab onToast={vi.fn()} />);
    fireEvent.click(await screen.findByText('Someone is harassing me'));

    const thread = within(
      await screen.findByRole('region', { name: 'Conversation' }),
    );
    await thread.findByText('Which email do you use?');
    const lines = thread
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');

    expect(lines).toHaveLength(9);
    expect(lines[0]).toContain('It keeps happening in my comments.');
    expect(lines[1]).toMatch(/^Handled by: Nobody → YouYou/);
    expect(lines[2]).toMatch(/^Priority: Normal → HighBen/);
    expect(lines[3]).toContain('Which email do you use?');
    expect(lines[4]).toMatch(/^Status: Open → Waiting for requesterYou/);
    expect(lines[5]).toMatch(
      /^Topic: Something else → Payments and plansSupport/,
    );
    expect(lines[6]).toMatch(/^Status: Waiting for requester → Open@ana/);
    expect(lines[7]).toMatch(/^Handed to moderationYou/);
    expect(lines[8]).toMatch(/^Status: With moderation → OpenSystem/);
    // The reference of the case is not shown.
    expect(thread.queryByText(/r-1/)).not.toBeInTheDocument();
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

  describe('working as a team', () => {
    beforeEach(() => {
      useAdminAuthStore.setState({ admin: agentOne } as never);
      vi.mocked(adminApi.assignSupportTicket).mockResolvedValue({
        data: ticket(),
      } as never);
      vi.mocked(adminApi.updateSupportTicket).mockResolvedValue({
        data: ticket(),
      } as never);
    });

    it('asks for the agent own tickets, the ones nobody has, and by priority', async () => {
      const i18n = await open([ticket()]);

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('admin.support.whose_mine'),
        }),
      );
      await waitFor(() =>
        expect(adminApi.getSupportTickets).toHaveBeenLastCalledWith(
          1,
          20,
          undefined,
          undefined,
          { assignment: 'mine' },
        ),
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('admin.support.whose_unassigned'),
        }),
      );
      fireEvent.change(
        screen.getByRole('combobox', {
          name: i18n.t('admin.support.filter_priority'),
        }),
        { target: { value: 'HIGH' } },
      );
      await waitFor(() =>
        expect(adminApi.getSupportTickets).toHaveBeenLastCalledWith(
          1,
          20,
          undefined,
          undefined,
          { assignment: 'unassigned', priority: 'HIGH' },
        ),
      );
    });

    it('names an agent the team no longer has as a former agent', async () => {
      const i18n = await open([ticket({ assignedAgentRef: 'admin-gone' })]);

      expect(
        screen.getAllByText(i18n.t('admin.support.assignee_former')).length,
      ).toBeGreaterThan(0);
    });

    describe('who leads the team', () => {
      const lead = {
        id: 'admin-1',
        roles: ['PLATFORM_ADMIN'],
        permissions: ['support', 'support.manage'],
      };
      const openAsLead = async (assignedAgentRef: string | null) => {
        useAdminAuthStore.setState({ admin: lead } as never);
        vi.mocked(adminApi.getSupportAgents).mockResolvedValue({
          data: [
            { ref: 'admin-1', name: 'Ana' },
            { ref: 'admin-2', name: 'Ben' },
          ],
        } as never);
        vi.mocked(adminApi.assignSupportTicket).mockResolvedValue({
          data: ticket(),
        } as never);
        const i18n = await open([ticket({ assignedAgentRef })]);
        const selector = await screen.findByRole('combobox', {
          name: i18n.t('admin.support.assign_to'),
        });
        return { i18n, selector };
      };

      it('gives a ticket to another agent, chosen by name', async () => {
        const { i18n, selector } = await openAsLead(null);

        expect(
          within(selector)
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual([
          i18n.t('admin.support.assignee_nobody'),
          i18n.t('admin.support.assignee_me_named', { name: 'Ana' }),
          'Ben',
        ]);
        fireEvent.change(selector, { target: { value: 'admin-2' } });

        await waitFor(() =>
          expect(adminApi.assignSupportTicket).toHaveBeenCalledWith(
            't-1',
            'admin-2',
          ),
        );
      });

      it('leaves a ticket with nobody', async () => {
        const { selector } = await openAsLead('admin-2');

        expect(selector).toHaveValue('admin-2');
        fireEvent.change(selector, { target: { value: '' } });

        await waitFor(() =>
          expect(adminApi.assignSupportTicket).toHaveBeenCalledWith(
            't-1',
            null,
          ),
        );
      });

      it('still shows who has the ticket when they can no longer be given tickets', async () => {
        const { i18n, selector } = await openAsLead('admin-gone');

        expect(selector).toHaveValue('admin-gone');
        expect(
          within(selector).getByRole('option', {
            name: i18n.t('admin.support.assignee_former'),
          }),
        ).toBeInTheDocument();
      });
    });

    it('does not offer an agent the choice of who gets a ticket, nor ask for the list of agents', async () => {
      const i18n = await open([ticket({ assignedAgentRef: null })]);

      await screen.findByRole('button', { name: i18n.t('admin.support.take') });
      expect(
        screen.queryByRole('combobox', {
          name: i18n.t('admin.support.assign_to'),
        }),
      ).toBeNull();
      expect(adminApi.getSupportAgents).not.toHaveBeenCalled();
    });

    it('says who has each ticket and marks the high priority ones', async () => {
      vi.mocked(adminApi.getSupportTickets).mockResolvedValue({
        data: {
          ...page([ticket({ priority: 'HIGH', assignedAgentRef: 'admin-2' })])
            .data,
          agents: { 'admin-2': 'Ben' },
        },
      } as never);
      const rendered = renderWithProviders(
        <SupportTicketsTab onToast={onToast} />,
      );
      fireEvent.click(await screen.findByText('Someone is harassing me'));
      const i18n = rendered.i18n!;

      expect(screen.getAllByText('Ben').length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(i18n.t('admin.support.priority.HIGH')).length,
      ).toBeGreaterThan(0);
      // Not theirs and not free: neither taking nor releasing is offered.
      expect(
        screen.queryByRole('button', { name: i18n.t('admin.support.take') }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: i18n.t('admin.support.release') }),
      ).toBeNull();
    });

    it('takes a ticket nobody has', async () => {
      const i18n = await open([ticket({ assignedAgentRef: null })]);

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('admin.support.take') }),
      );

      await waitFor(() =>
        expect(adminApi.assignSupportTicket).toHaveBeenCalledWith(
          't-1',
          'admin-1',
        ),
      );
    });

    it('lets go of their own ticket', async () => {
      const i18n = await open([ticket({ assignedAgentRef: 'admin-1' })]);

      expect(
        screen.getAllByText(i18n.t('admin.support.assignee_me')).length,
      ).toBeGreaterThan(0);
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('admin.support.release') }),
      );

      await waitFor(() =>
        expect(adminApi.assignSupportTicket).toHaveBeenCalledWith('t-1', null),
      );
    });

    it('changes the priority of the ticket', async () => {
      const i18n = await open([ticket({ priority: 'NORMAL' })]);

      fireEvent.change(
        screen.getByRole('combobox', {
          name: i18n.t('admin.support.set_priority'),
        }),
        { target: { value: 'HIGH' } },
      );

      await waitFor(() =>
        expect(adminApi.updateSupportTicket).toHaveBeenCalledWith('t-1', {
          priority: 'HIGH',
        }),
      );
    });
  });
});
