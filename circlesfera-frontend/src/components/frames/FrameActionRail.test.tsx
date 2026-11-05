import { screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import FrameActionRail from './FrameActionRail';

vi.mock('../LikeButton', () => ({ default: () => <button type="button" /> }));

const frame = (likes: number | null) =>
  ({
    id: 'frame-1',
    profile: { username: 'ana', avatar: null },
    _count: { likes, comments: 7 },
  }) as unknown as Post;

function show(likes: number | null, likesCount: number) {
  renderWithProviders(
    <FrameActionRail
      post={frame(likes)}
      likesCount={likesCount}
      isBookmarked={false}
      onLikeToggle={vi.fn()}
      onCommentsOpen={vi.fn()}
      onShareOpen={vi.fn()}
      onBookmarkOpen={vi.fn()}
      onMenuToggle={vi.fn()}
      menuButtonRef={createRef()}
    />,
  );
}

describe('FrameActionRail', () => {
  it('shows the like count', () => {
    show(41, 42);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows no like count its author hid, even after the viewer liked it', () => {
    show(null, 1);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
