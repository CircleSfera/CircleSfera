import { screen, within } from '@testing-library/react';
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

// Notices of tags: one shown on the profile, one waiting for approval.

const notice = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: 'p-2',
  sender: { username: 'ana', avatar: null },
  read: false,
  createdAt: new Date().toISOString(),
  type: 'MENTION',
  postId: 'post-1',
  ...overrides,
});

const show = (items: object[]) =>
  vi.mocked(notificationsApi.getAll).mockResolvedValue({
    data: { data: items },
  } as never);

describe('Notifications of tags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('leads a tag waiting for approval to where tags are approved', async () => {
    show([notice({ targetType: 'tag_pending', targetId: 'post-1' })]);
    const { container, i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByText(i18n!.t('notifications.types.tag_pending')),
    ).toBeInTheDocument();
    const article = container.querySelector('article') as HTMLElement;
    expect(within(article).getByRole('link', { name: 'ana' })).toHaveAttribute(
      'href',
      '/accounts/tags',
    );
  });

  it('leads a tag already shown to the person who tagged, as a mention', async () => {
    show([notice({ targetType: 'tag', targetId: 'post-1' })]);
    const { container, i18n } = renderWithProviders(<Notifications />);
    await screen.findByText(i18n!.t('notifications.types.tag'));
    const article = container.querySelector('article') as HTMLElement;
    expect(within(article).getByRole('link', { name: 'ana' })).toHaveAttribute(
      'href',
      '/ana',
    );
  });
});
