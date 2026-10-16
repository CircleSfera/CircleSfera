import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import { brushStyle, translucent } from '../Editor/StoryCanvas';
import { STORY_COLORS } from '../storyComposer.constants';
import type { StoryBrush } from '../storyComposer.types';
import StoryDrawPanel from './StoryDrawPanel';

function show(brush: StoryBrush = 'pen') {
  const props = {
    storyCanvasRef: { current: { undo: vi.fn(), clear: vi.fn() } as never },
    brushWidth: 5,
    brushColor: '#FFFFFF',
    brush,
    onBrushWidthChange: vi.fn(),
    onBrushColorChange: vi.fn(),
    onBrushChange: vi.fn(),
  };
  renderWithProviders(<StoryDrawPanel {...props} />, { lng: 'es' });
  return props;
}

describe('the drawing brushes', () => {
  it('draw as a pen, a marker at half strength and twice as wide, and a neon glow of the colour', () => {
    expect(brushStyle('pen', '#ff3b30', 6)).toEqual({
      color: '#ff3b30',
      width: 6,
      strokeLineCap: 'round',
      glow: null,
    });
    expect(brushStyle('marker', '#ff3b30', 6)).toMatchObject({
      color: 'rgba(255, 59, 48, 0.5)',
      width: 12,
      strokeLineCap: 'butt',
    });
    expect(brushStyle('neon', '#34c759', 6)).toMatchObject({
      color: '#ffffff',
      glow: { color: '#34c759', blur: 12 },
    });
    expect(brushStyle('neon', '#34c759', 20).glow?.blur).toBe(40);
    expect(translucent('not a colour')).toBe('not a colour');
  });
});

describe('StoryDrawPanel', () => {
  it('offers four brushes by name, the chosen one pressed', () => {
    const { onBrushChange } = show('marker');

    for (const name of ['Pluma', 'Rotulador', 'Neón', 'Goma']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        name === 'Rotulador' ? 'true' : 'false',
      );
    }
    fireEvent.click(screen.getByRole('button', { name: 'Neón' }));
    expect(onBrushChange).toHaveBeenCalledWith('neon');
  });

  it('sizes every brush from 2 to 40 px, with the colours of the text', () => {
    show();
    const size = screen.getByRole('slider', { name: 'Grosor' });
    expect(size).toHaveAttribute('min', '2');
    expect(size).toHaveAttribute('max', '40');
    // The palette is the text's, and the white one is chosen whatever its case.
    const swatches = screen
      .getAllByRole('button')
      .filter(
        (b) =>
          b.getAttribute('aria-pressed') !== null &&
          !/Pluma|Rotulador|Neón|Goma/.test(b.textContent ?? ''),
      );
    expect(swatches).toHaveLength(STORY_COLORS.length);
    expect(swatches[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the colours for the eraser, which has none', () => {
    show('eraser');
    expect(screen.queryByText('Color')).not.toBeInTheDocument();
  });
});
