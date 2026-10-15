import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import StoryTextSizeSlider, {
  TEXT_SIZE_SLIDER_PX,
} from './StoryTextSizeSlider';

describe('StoryTextSizeSlider', () => {
  it('keeps the same size whatever the size of the text', () => {
    const { rerender } = renderWithProviders(
      <StoryTextSizeSlider value={12} onChange={vi.fn()} />,
      { lng: 'es' },
    );
    const slider = screen.getByTestId('text-size-slider');
    expect(slider.style.height).toBe(`${TEXT_SIZE_SLIDER_PX}px`);

    rerender(<StoryTextSizeSlider value={120} onChange={vi.fn()} />);
    expect(slider.style.height).toBe(`${TEXT_SIZE_SLIDER_PX}px`);
  });

  it('is a named, upright slider that changes the size', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <StoryTextSizeSlider value={24} onChange={onChange} />,
      {
        lng: 'es',
      },
    );
    const input = screen.getByRole('slider', { name: 'Tamaño' });
    expect(input).toHaveAttribute('aria-orientation', 'vertical');

    fireEvent.change(input, { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60);
  });
});
