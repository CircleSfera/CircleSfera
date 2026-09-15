import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post, ProfileWithUser } from '../../types';
import PostDetailView from './PostDetailView';

vi.mock('../../hooks/usePostInteractions', () => ({
  usePostInteractions: () => ({
    isDeleted: false,
    postRef: { current: null },
    menuButtonRef: { current: null },
    showMenu: false,
    setShowMenu: vi.fn(),
    likesCount: 0,
    isBookmarked: false,
    isBookmarkPending: false,
    handleToggleBookmark: vi.fn(),
    handleLikeToggle: vi.fn(),
    handleShare: vi.fn(),
    handleTip: vi.fn(),
  }),
}));

vi.mock('../CommentList', () => ({
  default: () => <div data-testid="comment-list" />,
}));

vi.mock('../interactive/PollWidget', () => ({
  PollWidget: () => <div data-testid="poll-widget" />,
}));

vi.mock('../interactive/QnaWidget', () => ({
  QnaWidget: () => <div data-testid="qna-widget" />,
}));

vi.mock('./PostActions', () => ({
  default: () => <div data-testid="post-actions" />,
}));

vi.mock('./PostContent', () => ({
  default: () => <div data-testid="post-content" />,
}));

vi.mock('./PostHeader', () => ({
  default: () => <div data-testid="post-header" />,
}));

vi.mock('./PostMedia', () => ({
  default: () => <div data-testid="post-media" />,
}));

vi.mock('./PostOverlays', () => ({
  default: () => null,
}));

const profile: ProfileWithUser = {
  id: 'profile-1',
  userId: 'user-1',
  username: 'IsabellaArts',
  fullName: 'Isabella Mendes',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const basePost: Post = {
  id: 'post-1',
  profileId: 'profile-1',
  caption: 'Caption',
  type: 'POST',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile,
  media: [],
  _count: { likes: 0, comments: 0 },
};

describe('PostDetailView', () => {
  it('does not render QnA in post detail (aligned with feed)', () => {
    renderWithProviders(
      <PostDetailView
        post={{ ...basePost, qnaBox: { id: 'qna-1' } }}
        comments={[]}
      />,
    );

    expect(screen.queryByTestId('qna-widget')).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-list')).toBeInTheDocument();
  });

  it('still renders polls in post detail', () => {
    renderWithProviders(
      <PostDetailView
        post={{ ...basePost, poll: { id: 'poll-1' } }}
        comments={[]}
      />,
    );

    expect(screen.getByTestId('poll-widget')).toBeInTheDocument();
  });
});
