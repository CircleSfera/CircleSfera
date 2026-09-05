import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import PostGrid from './PostGrid';

function post(
  partial: Partial<Post> & { id: string; type?: Post['type'] },
): Post {
  return {
    caption: '',
    media: [{ url: 'https://cdn.example/a.jpg', type: 'image' }],
    _count: { likes: 1, comments: 0 },
    ...partial,
  } as Post;
}

describe('PostGrid', () => {
  it('shows the empty state when there are no items', () => {
    renderWithProviders(
      <PostGrid
        items={[]}
        emptyMessage="No posts yet"
        emptySubtext="Share something"
        icon={null}
      />,
    );

    expect(screen.getByText('No posts yet')).toBeInTheDocument();
    expect(screen.getByText('Share something')).toBeInTheDocument();
  });

  it('links FRAME items to the Frames viewer and posts to detail', () => {
    renderWithProviders(
      <PostGrid
        items={[
          post({ id: 'frame-1', type: 'FRAME', caption: 'Reel' }),
          post({ id: 'post-1', type: 'POST', caption: 'Still' }),
        ]}
        emptyMessage="Empty"
        emptySubtext=""
        icon={null}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/frames?post=frame-1');
    expect(links[1]).toHaveAttribute('href', '/p/post-1');
  });
});
