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

  it('uses the explore discovery column layout with 4:5 tiles', () => {
    const { container } = renderWithProviders(
      <PostGrid
        items={[post({ id: 'post-1', type: 'POST', caption: 'Still' })]}
        emptyMessage="Empty"
        emptySubtext=""
        icon={null}
        columns="explore"
        aspectRatio="4/5"
      />,
    );

    const grid = container.querySelector('.grid');
    expect(grid).toHaveClass(
      'grid-cols-3',
      'md:grid-cols-4',
      'lg:grid-cols-5',
      'xl:grid-cols-6',
    );
    const tile = screen.getByRole('link');
    expect(tile).toHaveAttribute('href', '/p/post-1');
    expect(tile).toHaveClass('aspect-4/5');
  });
});
