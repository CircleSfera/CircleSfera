import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const notice = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: null,
  sender: null,
  type: 'MODERATION',
  content: 'A moderator warned you during your live broadcast.',
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const list = (...items: unknown[]) =>
  vi.mocked(notificationsApi.getAll).mockResolvedValue({
    data: { data: items },
  } as never);

// Moderation decisions, report outcomes and help come from CircleSfera:
// the member of staff who decided is never named.
describe('Notifications: from CircleSfera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names CircleSfera with its logo, and leads to no profile', async () => {
    list(notice({}));

    const { i18n } = renderWithProviders(<Notifications />);

    const name = i18n!.t('notifications.from_circlesfera');
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByRole('img', { name })).toHaveAttribute(
      'src',
      expect.stringContaining('logo'),
    );
    expect(
      screen.queryByText(i18n!.t('notifications.unknown_user')),
    ).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/undefined|null/);
    }
  });

  it('still leads to the content the notice is about', async () => {
    list(
      notice({
        postId: 'post-9',
        targetType: 'post_removed',
        targetId: 'post-9',
      }),
    );

    const { i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByText(i18n!.t('notifications.from_circlesfera')),
    ).toBeInTheDocument();
  });

  it('keeps naming a person who sent a notice', async () => {
    list(
      notice({
        type: 'FOLLOW',
        senderId: 's-1',
        sender: { id: 's-1', username: 'ana', avatar: '' },
        content: 'started following you',
      }),
    );

    renderWithProviders(<Notifications />);

    const links = await screen.findAllByRole('link', { name: /ana/ });
    expect(links[0]).toHaveAttribute('href', '/ana');
  });
});
