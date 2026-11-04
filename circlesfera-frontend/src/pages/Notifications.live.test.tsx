import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Notifications from './Notifications';

vi.mock('../services', () => ({
  notificationsApi: {
    getAll: vi.fn(),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../components/notifications/PendingFollowRequests', () => ({
  default: () => null,
}));

import { notificationsApi } from '../services';

// Notices of lives: one starting soon, and one that started.

const NOW = new Date('2026-11-03T12:00:00.000Z');

const notice = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: 'p-2',
  sender: { username: 'ana', avatar: null },
  read: false,
  createdAt: NOW.toISOString(),
  ...overrides,
});

const show = (items: object[]) =>
  vi.mocked(notificationsApi.getAll).mockResolvedValue({
    data: { data: items },
  } as never);

describe('Notifications of lives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says a live starts soon, from its host, and leads to the host', async () => {
    show([
      notice({
        type: 'LIVE_STARTING_SOON',
        content: 'is going live soon: "Sunday chat"',
        targetType: 'scheduled_live',
        targetId: 'sl-1',
      }),
    ]);
    const { container } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByText('is going live soon: "Sunday chat"'),
    ).toBeInTheDocument();
    const article = container.querySelector('article') as HTMLElement;
    const name = within(article).getByRole('link', { name: 'ana' });
    expect(name).toHaveAttribute('href', '/ana');
    // Its own icon: a live to come, not one on air.
    expect(article.querySelector('.lucide-calendar-clock')).not.toBeNull();
    expect(article.querySelector('.lucide-radio')).toBeNull();
  });

  it('leads a started live to the live, named after its host', async () => {
    show([
      notice({
        type: 'LIVE_STARTED',
        content: 'started the live you asked to be reminded of: "Sunday chat"',
        targetType: 'live',
        targetId: 'stream-1',
      }),
    ]);
    const { container, i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByText(
        'started the live you asked to be reminded of: "Sunday chat"',
      ),
    ).toBeInTheDocument();
    const article = container.querySelector('article') as HTMLElement;
    // The host, not the support team.
    const name = within(article).getByRole('link', { name: 'ana' });
    expect(name).toHaveAttribute('href', '/live/stream-1');
    expect(
      within(article).queryByText(i18n!.t('notifications.from_support')),
    ).not.toBeInTheDocument();
    const watch = within(article).getAllByRole('link', {
      name: i18n!.t('notifications.view_live'),
    });
    for (const link of watch) {
      expect(link).toHaveAttribute('href', '/live/stream-1');
    }
    expect(article.querySelector('.lucide-radio')).not.toBeNull();
  });
});
