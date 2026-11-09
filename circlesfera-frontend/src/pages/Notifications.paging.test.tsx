import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  default: () => <p>pending requests</p>,
}));

import { notificationsApi } from '../services';

// The activity page reads twenty notifications at a time, on scrolling, and
// filters them by kind.

const follow = (i: number) => ({
  id: `n-${i}`,
  recipientId: 'p-1',
  senderId: `p-${i}`,
  sender: { username: `user${i}`, avatar: null },
  type: 'FOLLOW',
  read: true,
  createdAt: new Date(2026, 10, 1, 0, 0, 60 - i).toISOString(),
});

const page = (items: object[], n: number, totalPages: number) => ({
  data: { data: items, meta: { page: n, limit: 20, total: 0, totalPages } },
});

// The sentinel's observer: the test says when it comes into view.
let seen: ((entries: { isIntersecting: boolean }[]) => void) | undefined;

describe('Notifications, a page at a time and by kind', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seen = undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof seen) {
          seen = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the next twenty when the end of the list comes into view', async () => {
    vi.mocked(notificationsApi.getAll).mockImplementation(
      async (n = 1) =>
        (n === 1
          ? page(
              Array.from({ length: 20 }, (_, i) => follow(i)),
              1,
              2,
            )
          : page([follow(20)], 2, 2)) as never,
    );
    renderWithProviders(<Notifications />);

    expect(await screen.findByText('user0')).toBeInTheDocument();
    expect(notificationsApi.getAll).toHaveBeenCalledWith(1, 20, 'all');
    expect(screen.queryByText('user20')).not.toBeInTheDocument();

    await waitFor(() => expect(seen).toBeDefined());
    seen?.([{ isIntersecting: true }]);

    expect(await screen.findByText('user20')).toBeInTheDocument();
    expect(notificationsApi.getAll).toHaveBeenCalledWith(2, 20, 'all');
  });

  it('asks the server for one kind when a filter is chosen', async () => {
    vi.mocked(notificationsApi.getAll).mockImplementation(
      async (_n, _l, kind) =>
        (kind === 'likes'
          ? page(
              [
                {
                  ...follow(1),
                  id: 'like-1',
                  type: 'LIKE',
                  sender: { username: 'liker', avatar: null },
                },
              ],
              1,
              1,
            )
          : page([follow(1)], 1, 1)) as never,
    );
    renderWithProviders(<Notifications />);
    expect(await screen.findByText('user1')).toBeInTheDocument();
    expect(screen.getByText('pending requests')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Likes' }));

    expect(await screen.findByText('liker')).toBeInTheDocument();
    expect(notificationsApi.getAll).toHaveBeenCalledWith(1, 20, 'likes');
    expect(screen.queryByText('user1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Likes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Follow requests belong to All and Follows only.
    expect(screen.queryByText('pending requests')).not.toBeInTheDocument();
  });
});
