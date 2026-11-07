import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Post } from '../../types';
import FrameOverlayInfo from './FrameOverlayInfo';

const frame = (over: Partial<Post> = {}) =>
  ({
    id: 'frame-1',
    profileId: 'author',
    caption: '',
    profile: { id: 'author', username: 'maker' },
    audio: null,
    audioId: null,
    studioTemplate: null,
    madeWithTemplate: null,
    ...over,
  }) as unknown as Post;
const show = (post: Post) =>
  renderWithProviders(
    <FrameOverlayInfo
      post={post}
      isOwner={false}
      isCaptionExpanded={false}
      onCaptionExpandedChange={vi.fn()}
      onFollow={vi.fn()}
    />,
  );

describe('a Frame’s template', () => {
  it('can be used from the Frame, with how many have used it', () => {
    show(frame({ studioTemplate: { id: 't', uses: 12 } }));
    expect(
      screen.getByRole('link', { name: 'Use template · 12 uses' }),
    ).toHaveAttribute('href', '/edits?template=frame-1');
  });

  it('says one use in the singular', () => {
    show(frame({ studioTemplate: { id: 't', uses: 1 } }));
    expect(screen.getByText('Use template · 1 use')).toBeInTheDocument();
  });

  it('credits the template a Frame was made with, linking to its Frame', () => {
    show(
      frame({ madeWithTemplate: { postId: 'source', username: 'creator' } }),
    );
    expect(
      screen.getByRole('link', { name: 'Template by @creator' }),
    ).toHaveAttribute('href', '/p/source');
  });

  it('shows neither for a Frame without a template', () => {
    show(frame());
    expect(screen.queryByText(/template/i)).not.toBeInTheDocument();
  });
});
