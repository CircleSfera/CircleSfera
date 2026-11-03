import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProgressiveImage from './ProgressiveImage';

describe('ProgressiveImage', () => {
  it('fills its box and crops by default', () => {
    render(<ProgressiveImage src="/a.jpg" alt="a" />);

    expect(screen.getByAltText('a')).toHaveClass('object-cover');
  });

  it('shows the whole picture inside its box when asked to', () => {
    render(<ProgressiveImage src="/a.jpg" alt="a" fit="contain" />);

    const picture = screen.getByAltText('a');
    expect(picture).toHaveClass('object-contain');
    expect(picture).not.toHaveClass('object-cover');
  });
});
