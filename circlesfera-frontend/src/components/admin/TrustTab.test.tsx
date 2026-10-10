import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import TrustTab from './TrustTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getTrustQueue: vi.fn() },
}));

const NOW = new Date('2026-03-10T12:00:00Z');
const ago = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

let where = '';
function Where() {
  where = useLocation().pathname;
  return null;
}

const queue = (over: object = {}) => ({
  data: {
    counts: { reports: 3, appeals: 1, tickets: 2 },
    reports: [
      {
        id: 'r1',
        reason: 'Spam',
        targetType: 'POST',
        status: 'PENDING',
        createdAt: ago(30),
        assignedAdmin: { displayName: 'Ana', email: 'ana@staff.test' },
      },
      {
        id: 'r2',
        reason: 'Abuse',
        targetType: 'COMMENT',
        status: 'PENDING',
        createdAt: ago(5 * 60),
        assignedAdmin: { email: 'ben@staff.test' },
      },
      {
        id: 'r3',
        reason: 'Other',
        targetType: 'STORY',
        status: 'PENDING',
        createdAt: ago(3 * 24 * 60),
        assignedAdmin: null,
      },
    ],
    appeals: [
      {
        id: 'a1',
        reason: 'It was a joke',
        targetType: 'POST',
        createdAt: ago(10),
        user: { email: 'eve@example.com' },
      },
    ],
    tickets: [
      {
        id: 't1',
        subject: 'Cannot log in',
        email: 'dan@example.com',
        status: 'OPEN',
        createdAt: ago(90),
      },
    ],
    ...over,
  },
});

function show(permissions: string[] = ['moderation']) {
  useAdminAuthStore.setState({
    hasPermission: (key: string) => permissions.includes(key),
  } as never);
  return renderWithProviders(
    <>
      <Where />
      <TrustTab />
    </>,
    { routerProps: { initialEntries: ['/trust'], useTransitions: false } },
  );
}

describe('TrustTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    where = '';
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    vi.mocked(adminApi.getTrustQueue).mockResolvedValue(queue() as never);
  });
  afterEach(() => vi.useRealTimers());

  it('says how much is waiting and offers a way into each queue', async () => {
    show();

    expect(
      await screen.findByText('6 items need attention'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All reports' })).toHaveAttribute(
      'href',
      '/reports',
    );
    expect(screen.getByRole('link', { name: 'All appeals' })).toHaveAttribute(
      'href',
      '/appeals',
    );
    expect(screen.getByRole('link', { name: 'All tickets' })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('lists what waits in each queue, with how long ago and who has it', async () => {
    show();

    expect(await screen.findByText('Spam')).toBeInTheDocument();
    expect(screen.getByText('POST · Ana')).toBeInTheDocument();
    expect(screen.getByText('COMMENT · ben@staff.test')).toBeInTheDocument();
    expect(screen.getByText('STORY')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('3d')).toBeInTheDocument();
    expect(screen.getByText('eve@example.com')).toBeInTheDocument();
    expect(screen.getByText('It was a joke')).toBeInTheDocument();
    expect(screen.getByText('Cannot log in')).toBeInTheDocument();
    expect(screen.getByText('dan@example.com')).toBeInTheDocument();
  });

  it.each([
    [/Spam/, '/reports'],
    [/eve@example.com/, '/appeals'],
    [/Cannot log in/, '/support'],
  ])('opens the queue of the item that is pressed (%s)', async (name, path) => {
    show();
    fireEvent.click(await screen.findByRole('button', { name }));
    expect(where).toBe(path);
  });

  it('says the queues are clear, each in its own words', async () => {
    vi.mocked(adminApi.getTrustQueue).mockResolvedValue(
      queue({
        counts: { reports: 0, appeals: 0, tickets: 0 },
        reports: [],
        appeals: [],
        tickets: [],
      }) as never,
    );
    show();

    expect(await screen.findByText('Queues clear')).toBeInTheDocument();
    expect(screen.getByText('No pending reports')).toBeInTheDocument();
    expect(screen.getByText('No pending appeals')).toBeInTheDocument();
    expect(screen.getByText('No open tickets')).toBeInTheDocument();
  });

  it('offers the moderation queue only to who may open it', async () => {
    const allowed = show();
    expect(
      await screen.findByRole('link', { name: /Open AI moderation queue/ }),
    ).toHaveAttribute('href', '/moderation');
    allowed.unmount();

    show([]);
    await screen.findByText('6 items need attention');
    expect(
      screen.queryByRole('link', { name: /Open AI moderation queue/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [20_000, 'Median: 1 min'],
    [45 * 60_000, 'Median: 45 min'],
    [5 * 3_600_000, 'Median: 5 h'],
    [3 * 86_400_000, 'Median: 3 d'],
  ])(
    'says how long reports take to resolve (%i ms)',
    async (medianMs, text) => {
      vi.mocked(adminApi.getTrustQueue).mockResolvedValue(
        queue({
          reportMttr: { windowDays: 30, resolvedCount: 12, medianMs },
        }) as never,
      );
      show();

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(
        screen.getByText('Based on 12 resolved reports'),
      ).toBeInTheDocument();
    },
  );

  it('says when nothing was resolved in the period, for each queue it has figures for', async () => {
    vi.mocked(adminApi.getTrustQueue).mockResolvedValue(
      queue({
        appealMttr: { windowDays: 30, resolvedCount: 0, medianMs: null },
        ticketMttr: { windowDays: 30, resolvedCount: 4, medianMs: null },
      }) as never,
    );
    show();

    expect(await screen.findByText('Appeals')).toBeInTheDocument();
    expect(screen.getByText('Support tickets')).toBeInTheDocument();
    expect(
      screen.getAllByText('No resolved reports in the last 30 days.'),
    ).toHaveLength(2);
  });

  it('shows no resolution times when the server sends none', async () => {
    show();
    await screen.findByText('6 items need attention');
    expect(
      screen.queryByText('Resolution time (30 days)'),
    ).not.toBeInTheDocument();
  });

  it('names an appeal by the username when there is no email, and by a dash when there is neither', async () => {
    vi.mocked(adminApi.getTrustQueue).mockResolvedValue(
      queue({
        appeals: [
          {
            id: 'a1',
            reason: 'x',
            targetType: 'POST',
            createdAt: ago(1),
            user: { profile: { username: 'eve' } },
          },
          {
            id: 'a2',
            reason: 'y',
            targetType: 'POST',
            createdAt: ago(1),
            user: null,
          },
        ],
      }) as never,
    );
    show();

    expect(await screen.findByText('eve')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows placeholders, and no summary, while the queues load', () => {
    vi.mocked(adminApi.getTrustQueue).mockReturnValue(new Promise(() => {}));
    show();

    expect(
      screen.queryByText(/need attention|Queues clear/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Trust Queue')).toBeInTheDocument();
  });
});
