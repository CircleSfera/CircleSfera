import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { SharedPostSticker, sharedPostPath } from './SharedPostSticker';

const card = {
  id: 'post-1',
  type: 'POST',
  image: 'https://media.example/p.jpg',
  username: 'ana',
  avatar: null,
};

describe('a post shared to a story', () => {
  it('shows its author and picture, and opens the post', () => {
    renderWithProviders(<SharedPostSticker card={card} />);

    const link = screen.getByRole('link', { name: 'Open the post of ana' });
    expect(link).toHaveAttribute('href', '/p/post-1');
    expect(screen.getByText('ana')).toBeInTheDocument();
  });

  it('opens a Frame in the Frames viewer', () => {
    expect(sharedPostPath({ id: 'f-1', type: 'FRAME' })).toBe(
      '/frames?post=f-1',
    );
    expect(sharedPostPath({ id: 'p 1', type: 'POST' })).toBe('/p/p%201');
  });

  it('says the post is not available, and opens nothing, once it is gone', () => {
    renderWithProviders(<SharedPostSticker card={null} />);

    expect(screen.getByText('This post is not available')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
