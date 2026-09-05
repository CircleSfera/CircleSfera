import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import InteractionRail from './InteractionRail';

vi.mock('../LikeButton', () => ({
  default: ({ onToggle }: { onToggle?: (liked: boolean) => void }) => (
    <button type="button" onClick={() => onToggle?.(true)}>
      Like
    </button>
  ),
}));

describe('InteractionRail', () => {
  it('fires horizontal callbacks', async () => {
    const user = userEvent.setup();
    const onLikeToggle = vi.fn();
    const onComment = vi.fn();
    const onShare = vi.fn();
    const onBookmark = vi.fn();

    render(
      <InteractionRail
        postId="p1"
        variant="horizontal"
        isBookmarked={false}
        onLikeToggle={onLikeToggle}
        onComment={onComment}
        onShare={onShare}
        onBookmark={onBookmark}
      />,
    );

    await user.click(screen.getByText('Like'));
    await user.click(screen.getByLabelText(/comment/i));
    await user.click(screen.getByLabelText(/share/i));
    await user.click(screen.getByLabelText(/save/i));

    expect(onLikeToggle).toHaveBeenCalledWith(true);
    expect(onComment).toHaveBeenCalled();
    expect(onShare).toHaveBeenCalled();
    expect(onBookmark).toHaveBeenCalled();
  });

  it('shows counts in vertical variant', () => {
    render(
      <InteractionRail
        postId="p1"
        variant="vertical"
        likesCount={12}
        commentsCount={3}
        isBookmarked
        showCounts
        onLikeToggle={vi.fn()}
        onComment={vi.fn()}
        onShare={vi.fn()}
        onBookmark={vi.fn()}
        shareIcon="share"
      />,
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(
      document.querySelector('[data-interaction-rail="vertical"]'),
    ).toBeTruthy();
  });
});
