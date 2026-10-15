import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { StoryElement } from '../../types';
import DraggableStoryElement from './DraggableStoryElement';

const piece = {
  id: 'p',
  type: 'sticker',
  content: '🔥',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
} as StoryElement;

const zOf = (props: { isSelected: boolean; isActive?: boolean }) => {
  const { unmount } = renderWithProviders(
    <DraggableStoryElement
      el={piece}
      containerRef={{ current: null }}
      onPointerDown={vi.fn()}
      {...props}
    />,
  );
  const z = screen.getByTestId('story-element').style.zIndex;
  unmount();
  return Number(z);
};

describe('DraggableStoryElement', () => {
  it('puts the piece under the fingers above a selected one', () => {
    expect(zOf({ isSelected: true, isActive: true })).toBeGreaterThan(
      zOf({ isSelected: true }),
    );
    expect(zOf({ isSelected: true })).toBeGreaterThan(
      zOf({ isSelected: false }),
    );
  });

  it('paints an answer card into the picture, at the width of a sticker', () => {
    renderWithProviders(
      <DraggableStoryElement
        el={{
          ...piece,
          type: 'answer',
          content: JSON.stringify({ prompt: 'Ask me', answer: 'Why?' }),
        }}
        containerRef={{ current: null }}
        onPointerDown={vi.fn()}
        isSelected={false}
      />,
    );

    const el = screen.getByTestId('story-element');
    expect(el).toHaveTextContent('Ask me');
    expect(el).toHaveTextContent('Why?');
    expect(el).not.toHaveAttribute('data-export-ignore');
  });
});
