import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import FrameClipsOrder from './FrameClipsOrder';
import { wholeClip } from './frameClips';

const clip = (name: string) =>
  wholeClip({ file: new File([name], name, { type: 'video/webm' }), ms: 5000 });

function open() {
  const props = { onMove: vi.fn(), onDone: vi.fn() };
  renderWithProviders(
    <FrameClipsOrder clips={[clip('a'), clip('b'), clip('c')]} {...props} />,
    { lng: 'es' },
  );
  return props;
}

describe('FrameClipsOrder', () => {
  it('shows each clip in its own card, with its length', () => {
    open();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Clip 2 de 3')).toBeInTheDocument();
    expect(screen.getAllByText('0:05')).toHaveLength(3);
  });

  it('moves a clip dragged by its grip', () => {
    const { onMove } = open();
    const grip = screen.getByRole('button', { name: 'Mover Clip 1 de 3' });

    fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1 });
    // Card middles read as 0 in the test: past them all, the last place.
    fireEvent.pointerMove(grip, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(grip, { pointerId: 1 });

    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('leaves the order as it is for a grip let go where it was', () => {
    const { onMove } = open();
    const grip = screen.getByRole('button', { name: 'Mover Clip 1 de 3' });
    fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(grip, { pointerId: 1 });
    fireEvent.pointerCancel(grip, { pointerId: 1 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves a clip with the arrow keys on its grip', () => {
    const { onMove } = open();
    const grip = screen.getByRole('button', { name: 'Mover Clip 2 de 3' });
    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'Tab' });
    expect(onMove.mock.calls).toEqual([
      [1, 0],
      [1, 2],
    ]);
  });

  it('closes with Listo', () => {
    const { onDone } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onDone).toHaveBeenCalled();
  });
});
