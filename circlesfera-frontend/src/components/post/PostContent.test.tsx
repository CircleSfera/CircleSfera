import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostContent from './PostContent';

const post = {
  id: 'post-1',
  caption: '',
  createdAt: '2026-03-05T12:00:00.000Z',
  profile: { username: 'ana' },
} as unknown as Post;

describe('PostContent', () => {
  it.each([
    ['en', 'March 5, 2026', '12.3K'],
    ['es', '5 de marzo de 2026', '12,3 mil'],
  ] as const)('writes the date and like count in %s', (lng, date, likes) => {
    renderWithProviders(
      <PostContent post={post} likesCount={12345} isDetailMode />,
      { lng },
    );

    expect(screen.getByText(date)).toBeInTheDocument();
    expect(screen.getByText(likes, { exact: false })).toBeInTheDocument();
  });
});
