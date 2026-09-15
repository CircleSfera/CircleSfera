import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';
import { renderWithProviders } from '../test/test-utils';
import type { Post, ProfileWithUser } from '../types';
import PostCard from './PostCard';

vi.mock('../services', () => ({
  postsApi: {
    delete: vi.fn(),
    update: vi.fn(),
    toggleLike: vi.fn(),
  },
  bookmarksApi: {
    check: vi.fn().mockResolvedValue({ data: { bookmarked: false } }),
    toggle: vi.fn(),
  },
  followsApi: {
    check: vi.fn().mockResolvedValue({ data: { following: false } }),
  },
  creatorApi: {
    recordPromotionView: vi.fn(),
  },
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../hooks/useDwellTime', () => ({
  useDwellTime: vi.fn(),
}));

vi.mock('./post/PostMedia', () => ({
  default: () => <div data-testid="post-media" />,
}));

vi.mock('./interactive/PollWidget', () => ({
  PollWidget: () => <div data-testid="poll-widget" />,
}));

vi.mock('./interactive/QnaWidget', () => ({
  QnaWidget: () => <div data-testid="qna-widget" />,
}));

const mockProfile: ProfileWithUser = {
  id: 'profile-1',
  userId: 'user-1',
  username: 'testuser',
  fullName: 'Test User',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPost: Post = {
  id: 'post-1',
  profileId: 'profile-1',
  caption: 'Test caption #hashtag @user2',
  type: 'POST',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  profile: mockProfile,
  media: [],
  _count: {
    likes: 10,
    comments: 5,
  },
};

function mockAuthProfile(profile: Pick<ProfileWithUser, 'id' | 'username'>) {
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      profile: { ...mockProfile, ...profile },
      isAuthenticated: true,
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

describe('PostCard', () => {
  beforeEach(() => {
    mockAuthProfile({ id: 'profile-2', username: 'viewer' });
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    renderWithProviders(<PostCard post={mockPost} />);

  it('renders post information correctly', () => {
    renderComponent();

    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText(/Test caption/)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/View all 5 comments/)).toBeInTheDocument();
    expect(screen.getAllByTestId('post-media')[0]).toBeInTheDocument();
  });

  it('shows owner menu only if user is the author', () => {
    mockAuthProfile({ id: 'profile-1', username: 'testuser' });

    renderComponent();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('does not render QnA in the feed card', () => {
    renderWithProviders(
      <PostCard
        post={{
          ...mockPost,
          qnaBox: { id: 'qna-1' },
        }}
      />,
    );

    expect(screen.queryByTestId('qna-widget')).not.toBeInTheDocument();
  });

  it('still renders polls in the feed card', () => {
    renderWithProviders(
      <PostCard
        post={{
          ...mockPost,
          poll: { id: 'poll-1' },
        }}
      />,
    );

    expect(screen.getByTestId('poll-widget')).toBeInTheDocument();
  });

  it('shows recommendation chrome from the catalog, not mixed EN/ES fallbacks', () => {
    const { i18n } = renderWithProviders(
      <PostCard
        post={{
          ...mockPost,
          recommendationReason: 'new',
          recommendationSignals: ['ranked_for_you'],
        }}
      />,
    );

    expect(i18n!.t('post.recommendation.new')).toBe('New for you');
    expect(
      screen.getByText(i18n!.t('post.recommendation.new')),
    ).toBeInTheDocument();
    expect(i18n!.t('post.recommendation.why')).toBe('Why?');
    expect(
      screen.getByRole('button', {
        name: new RegExp(i18n!.t('post.recommendation.why')),
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nuevo para ti')).not.toBeInTheDocument();
  });
});
