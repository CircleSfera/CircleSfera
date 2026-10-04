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

const moderationNotice = (overrides: Record<string, unknown>) => ({
  id: 'n-1',
  recipientId: 'p-1',
  senderId: null,
  sender: null,
  type: 'MODERATION',
  content: 'Strike 2 of 3 on this profile (stored English text)',
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('Notifications: warning and strike notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a strike notice in the reader language with a link to the details', async () => {
    vi.mocked(notificationsApi.getAll).mockResolvedValue({
      data: {
        data: [
          moderationNotice({
            targetType: 'profile_suspension',
            targetId: 'strike-1',
          }),
        ],
      },
    } as never);

    const { i18n } = renderWithProviders(<Notifications />);

    expect(
      await screen.findByText(
        i18n!.t('notifications.types.moderation_suspension'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stored English text/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: i18n!.t('notifications.strike_details_cta'),
      }),
    ).toHaveAttribute('href', '/accounts/appeals');
  });

  it('keeps other moderation notices as they were', async () => {
    vi.mocked(notificationsApi.getAll).mockResolvedValue({
      data: {
        data: [
          moderationNotice({
            content: 'Your post was hidden',
            postId: 'post-1',
          }),
        ],
      },
    } as never);

    const { i18n } = renderWithProviders(<Notifications />);

    const links = await screen.findAllByRole('link', {
      name: i18n!.t('notifications.appeal_cta'),
    });
    expect(links[0]).toHaveAttribute(
      'href',
      '/accounts/appeals?targetType=POST_REMOVAL&targetId=post-1',
    );
    expect(
      screen.queryByText(i18n!.t('notifications.strike_details_cta')),
    ).not.toBeInTheDocument();
  });
});
