import { screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post, ProfileWithUser } from '../../types';
import PostHeader from './PostHeader';

vi.mock('../../utils/telemetry.js', () => ({
  telemetry: { track: vi.fn() },
}));

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

const post: Post = {
  id: 'post-1',
  profileId: 'profile-1',
  caption: null,
  type: 'POST',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  profile,
  media: [],
  _count: { likes: 0, comments: 0 },
} as Post;

describe('PostHeader', () => {
  it('labels avatar, more menu, and back from the catalog', () => {
    const { i18n } = renderWithProviders(
      <PostHeader
        post={post}
        menuButtonRef={createRef<HTMLButtonElement>()}
        onMenuToggle={vi.fn()}
        showBack
      />,
    );

    expect(
      screen.getByRole('link', {
        name: i18n!.t('common.view_profile', { username: 'alice' }),
      }),
    ).toHaveAttribute('href', '/alice');
    expect(
      screen.getByRole('button', { name: i18n!.t('post.header.more_options') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('common.back') }),
    ).toBeInTheDocument();
    expect(i18n!.t('common.view_profile', { username: 'alice' })).toBe(
      "View alice's profile",
    );
    expect(i18n!.t('post.header.more_options')).toBe('More options');
    expect(i18n!.t('common.back')).toBe('Back');
    expect(
      screen.queryByRole('link', { name: 'Ver perfil de alice' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Más opciones' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Volver' }),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish catalog labels', () => {
    const { i18n } = renderWithProviders(
      <PostHeader
        post={post}
        menuButtonRef={createRef<HTMLButtonElement>()}
        onMenuToggle={vi.fn()}
        showBack
      />,
      { lng: 'es' },
    );

    expect(i18n!.t('common.view_profile', { username: 'alice' })).toBe(
      'Ver perfil de alice',
    );
    expect(
      screen.getByRole('link', {
        name: i18n!.t('common.view_profile', { username: 'alice' }),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('post.header.more_options') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('common.back') }),
    ).toBeInTheDocument();
  });
});
