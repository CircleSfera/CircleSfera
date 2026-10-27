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

const removal = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: null,
  sender: null,
  type: 'MODERATION',
  content:
    'Moderation removed your post. Reason: Spam. You can appeal this decision once, within six months.',
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const list = (...items: unknown[]) =>
  vi.mocked(notificationsApi.getAll).mockResolvedValue({
    data: { data: items },
  } as never);

describe('Notifications: content staff removed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a removed post shows why and opens the appeal form filled in with it', async () => {
    list(
      removal({
        postId: 'post-9',
        targetType: 'post_removed',
        targetId: 'post-9',
        appealable: true,
      }),
    );

    const { i18n } = renderWithProviders(<Notifications />);

    expect(await screen.findByText(/Reason: Spam/)).toBeInTheDocument();
    const appeal = screen.getByRole('link', {
      name: i18n!.t('notifications.removal_appeal_cta'),
    });
    expect(appeal).toHaveAttribute(
      'href',
      '/accounts/appeals?targetType=POST_REMOVAL&targetId=post-9',
    );
    // One way to appeal, not two.
    expect(
      screen.queryByRole('link', { name: i18n!.t('notifications.appeal_cta') }),
    ).not.toBeInTheDocument();
  });

  it('a removal that has just arrived can be appealed', async () => {
    list(
      removal({
        postId: 'post-9',
        targetType: 'post_removed',
        targetId: 'post-9',
      }),
    );

    const { i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByRole('link', {
        name: i18n!.t('notifications.removal_appeal_cta'),
      }),
    ).toBeInTheDocument();
  });

  it('a post already appealed or past its six months has no button', async () => {
    list(
      removal({
        postId: 'post-9',
        targetType: 'post_removed',
        targetId: 'post-9',
        appealable: false,
      }),
    );

    const { i18n } = renderWithProviders(<Notifications />);

    expect(await screen.findByText(/Reason: Spam/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: i18n!.t('notifications.removal_appeal_cta'),
      }),
    ).not.toBeInTheDocument();
  });

  it('a removed story or comment says why, with nothing to appeal', async () => {
    list(
      removal({
        id: 'n-story',
        content: 'Moderation removed your story. Reason: Nudity.',
        targetType: 'story_removed',
        targetId: 'story-1',
        appealable: false,
      }),
      removal({
        id: 'n-comment',
        content: 'Moderation removed your comment. Reason: Insults.',
        targetType: 'comment_removed',
        targetId: 'comment-1',
        appealable: false,
      }),
    );

    renderWithProviders(<Notifications />);

    expect(await screen.findByText(/Reason: Nudity/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Insults/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /appeal/i })).toBeNull();
  });
});
