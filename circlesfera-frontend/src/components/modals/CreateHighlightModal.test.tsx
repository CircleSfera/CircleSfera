import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightsApi, storiesApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import type { ProfileWithUser, Story } from '../../types';
import CreateHighlightModal from './CreateHighlightModal';

vi.mock('../../services', () => ({
  highlightsApi: {
    create: vi.fn(),
  },
  storiesApi: {
    getArchive: vi.fn(),
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

function story(id: string, url: string): Story {
  return {
    id,
    profileId: 'me-1',
    url,
    mediaType: 'image',
    expiresAt: '2026-01-02T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    profile: me,
  };
}

const storyA = story('story-a', 'https://cdn.example.com/a.jpg');
const storyB = story('story-b', 'https://cdn.example.com/b.jpg');

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

describe('CreateHighlightModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    vi.mocked(storiesApi.getArchive).mockResolvedValue({
      data: [storyA, storyB],
    } as never);
    vi.mocked(highlightsApi.create).mockResolvedValue({} as never);
  });

  it('renders nothing when closed and does not fetch', () => {
    renderWithProviders(
      <CreateHighlightModal isOpen={false} onClose={onClose} />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(storiesApi.getArchive).not.toHaveBeenCalled();
  });

  it('does not fetch the archive without a profile', () => {
    mockAuth(null);

    renderWithProviders(<CreateHighlightModal isOpen onClose={onClose} />);

    expect(screen.getByText('New Highlight')).toBeInTheDocument();
    expect(storiesApi.getArchive).not.toHaveBeenCalled();
  });

  it('keeps Next disabled until a story is selected', async () => {
    vi.mocked(storiesApi.getArchive).mockResolvedValue({
      data: [],
    } as never);

    renderWithProviders(<CreateHighlightModal isOpen onClose={onClose} />);

    expect(await screen.findByText('No stories found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(highlightsApi.create).not.toHaveBeenCalled();
  });

  it('closes from the dialog X without creating', async () => {
    renderWithProviders(<CreateHighlightModal isOpen onClose={onClose} />);

    await screen.findAllByAltText('Story');
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(highlightsApi.create).not.toHaveBeenCalled();
  });

  it('creates a highlight with the first selected story as cover', async () => {
    renderWithProviders(<CreateHighlightModal isOpen onClose={onClose} />);

    const thumbs = await screen.findAllByAltText('Story');
    fireEvent.click(thumbs[1].closest('button')!);
    fireEvent.click(thumbs[0].closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Title & Cover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Highlight Name'), {
      target: { value: 'Summer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(highlightsApi.create).toHaveBeenCalled();
    });
    expect(vi.mocked(highlightsApi.create).mock.calls[0][0]).toEqual({
      title: 'Summer',
      storyIds: ['story-b', 'story-a'],
      coverUrl: 'https://cdn.example.com/b.jpg',
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
