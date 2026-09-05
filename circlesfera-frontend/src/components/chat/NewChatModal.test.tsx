import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi, followsApi, searchApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import type { Profile, ProfileWithUser } from '../../types';
import NewChatModal from './NewChatModal';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 72,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 72,
        size: 72,
        end: (index + 1) * 72,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('../../services', () => ({
  chatApi: {
    createGroup: vi.fn(),
  },
  followsApi: {
    getFollowing: vi.fn(),
  },
  searchApi: {
    searchUsers: vi.fn(),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const me: ProfileWithUser = {
  id: 'me-1',
  userId: 'user-me',
  username: 'me',
  fullName: 'Me',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const bob: Profile = {
  ...me,
  id: 'bob-1',
  userId: 'user-bob',
  username: 'bob',
  fullName: 'Bob',
};

const cara: Profile = {
  ...me,
  id: 'cara-1',
  userId: 'user-cara',
  username: 'cara',
  fullName: 'Cara',
};

function mockAuth(profile: ProfileWithUser | null = me) {
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      profile,
      isAuthenticated: !!profile,
      isCreatorModeActive: false,
      isSessionChecked: true,
      isCheckingSession: false,
      setCreatorMode: vi.fn(),
      setAuthenticated: vi.fn(),
      setProfile: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      checkSession: vi.fn().mockResolvedValue(undefined),
    }),
  );
}

describe('NewChatModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(followsApi.getFollowing).mockResolvedValue({
      data: [bob, cara],
    } as never);
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [bob],
    } as never);
    vi.mocked(chatApi.createGroup).mockResolvedValue({
      data: { id: 'conv-1' },
    } as never);
  });

  it('renders nothing when closed and does not fetch', () => {
    renderWithProviders(<NewChatModal isOpen={false} onClose={onClose} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(followsApi.getFollowing).not.toHaveBeenCalled();
    expect(searchApi.searchUsers).not.toHaveBeenCalled();
  });

  it('shows the empty following state and closes without creating', async () => {
    vi.mocked(followsApi.getFollowing).mockResolvedValue({
      data: [],
    } as never);

    renderWithProviders(<NewChatModal isOpen onClose={onClose} />);

    expect(await screen.findByText('New Message')).toBeInTheDocument();
    expect(await screen.findByText('No Following')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat' })).toBeDisabled();
    expect(followsApi.getFollowing).toHaveBeenCalledWith('me');

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(chatApi.createGroup).not.toHaveBeenCalled();
  });

  it('starts a DM without a group name', async () => {
    renderWithProviders(<NewChatModal isOpen onClose={onClose} />);

    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));

    await waitFor(() => {
      expect(chatApi.createGroup).toHaveBeenCalledWith({
        participantIds: ['bob-1'],
        name: undefined,
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/direct/inbox/t/conv-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts a named group when two people are selected', async () => {
    renderWithProviders(<NewChatModal isOpen onClose={onClose} />);

    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    fireEvent.click(screen.getByRole('button', { name: /cara/i }));
    fireEvent.change(
      screen.getByPlaceholderText('Name your group (optional)'),
      { target: { value: 'Weekend' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));

    await waitFor(() => {
      expect(chatApi.createGroup).toHaveBeenCalledWith({
        participantIds: ['bob-1', 'cara-1'],
        name: 'Weekend',
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/direct/inbox/t/conv-1');
  });

  it('does not search until the query has two characters', async () => {
    renderWithProviders(<NewChatModal isOpen onClose={onClose} />);

    await screen.findByText('Suggested');
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'b' },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
    expect(searchApi.searchUsers).not.toHaveBeenCalled();
  });

  it('searches users and hides the current profile', async () => {
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [me, bob],
    } as never);

    renderWithProviders(<NewChatModal isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'bo' },
    });

    await waitFor(() => {
      expect(searchApi.searchUsers).toHaveBeenCalledWith('bo');
    });
    expect(
      await screen.findByRole('button', { name: /bob/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^me\b/i }),
    ).not.toBeInTheDocument();
  });
});
