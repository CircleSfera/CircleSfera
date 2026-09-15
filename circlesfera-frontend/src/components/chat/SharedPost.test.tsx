import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post, ProfileWithUser } from '../../types';
import SharedPost from './SharedPost';

vi.mock('../UserAvatar', () => ({
  default: () => <div data-testid="user-avatar" />,
}));

const profile: ProfileWithUser = {
  id: 'profile-1',
  userId: 'user-1',
  username: 'alice',
  fullName: 'Alice',
  bio: null,
  avatar: null,
  standardUrl: null,
  thumbnailUrl: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function buildPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    profileId: 'profile-1',
    caption: null,
    type: 'POST',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profile,
    media: [{ url: 'https://cdn.example.com/photo.jpg', type: 'image' }],
    _count: { likes: 0, comments: 0 },
    ...overrides,
  } as Post;
}

describe('SharedPost', () => {
  it('uses the catalog alt when the post has no caption', () => {
    const { i18n } = renderWithProviders(<SharedPost post={buildPost()} />);

    expect(i18n!.t('common.alt.post')).toBe('Post preview');
    expect(screen.getByAltText(i18n!.t('common.alt.post'))).toBeInTheDocument();
    expect(
      screen.queryByAltText('Vista previa de la publicación'),
    ).not.toBeInTheDocument();
  });

  it('uses the Spanish catalog alt without a caption', () => {
    const { i18n } = renderWithProviders(<SharedPost post={buildPost()} />, {
      lng: 'es',
    });

    expect(i18n!.t('common.alt.post')).toBe('Vista previa de la publicación');
    expect(screen.getByAltText(i18n!.t('common.alt.post'))).toBeInTheDocument();
  });

  it('uses the caption as alt when the author wrote one', () => {
    renderWithProviders(
      <SharedPost post={buildPost({ caption: 'Sunset at the pier' })} />,
    );

    expect(screen.getByAltText('Sunset at the pier')).toBeInTheDocument();
  });
});
