import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FRAME_MIN_DURATION_SEC } from '../../constants/uploadLimits';
import { renderWithProviders } from '../../test/test-utils';
import FrameClipsEditor from './FrameClipsEditor';

const painter = vi.hoisted(() => ({ props: {} as Record<string, any> }));
vi.mock('../story/StoryComposer', () => ({
  default: (props: Record<string, any>) => {
    painter.props = props;
    return <div data-testid="painter" />;
  },
}));

import { wholeClip } from './frameClips';

const clip = (name: string, ms: number) =>
  wholeClip({ file: new File(['v'], name, { type: 'video/webm' }), ms });
const half = (FRAME_MIN_DURATION_SEC * 1000) / 2;

function open(clips = [clip('a', half), clip('b', half), clip('c', half)]) {
  const onDone = vi.fn();
  renderWithProviders(
    <FrameClipsEditor clips={clips} onDone={onDone} onCancel={vi.fn()} />,
    { lng: 'es' },
  );
  return onDone;
}

describe('FrameClipsEditor', () => {
  it('goes on with the clips in the order and windows chosen', () => {
    const onDone = open();

    fireEvent.click(screen.getByRole('button', { name: 'Clip 3 de 3' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Mover el clip antes' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    const [[clips]] = onDone.mock.calls;
    expect(clips.map((c: { file: File }) => c.file.name)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('does not go on while the clips are shorter than a Frame', () => {
    const onDone = open();

    // Taking out a clip leaves less than a Frame.
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el clip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el clip' }));

    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Quitar el clip' }),
    ).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('trims the clip chosen from its start', () => {
    const onDone = open([clip('a', FRAME_MIN_DURATION_SEC * 1000 + 2000)]);

    const [start] = screen.getAllByRole('slider');
    fireEvent.change(start, { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][0][0]).toMatchObject({ startMs: 1000 });
  });

  it('paints text and drawing over the first clip, and goes on with that layer', async () => {
    const onDone = open();

    fireEvent.click(screen.getByRole('button', { name: 'Texto y dibujo' }));
    await screen.findByTestId('painter');
    expect(painter.props.paintOnly).toBe(true);
    expect(painter.props.initialMedia.name).toBe('a');

    const layer = new Blob(['png'], { type: 'image/png' });
    act(() => {
      painter.props.onElementsChange([{ id: 't', type: 'text' }]);
      painter.props.onPost(layer);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1]).toEqual({
      layer,
      elements: [{ id: 't', type: 'text' }],
    });
  });

  it('opens again with what was painted, and keeps it', async () => {
    const layer = new Blob(['png'], { type: 'image/png' });
    const elements = [{ id: 't', type: 'text' }] as never[];
    const onDone = vi.fn();
    renderWithProviders(
      <FrameClipsEditor
        clips={[clip('a', half), clip('b', half)]}
        painting={{ layer, elements }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
      { lng: 'es' },
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Editar texto y dibujo' }),
    );
    await screen.findByTestId('painter');
    expect(painter.props.elements).toEqual(elements);
    act(() => painter.props.onClose());
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1]).toEqual({ layer, elements });
  });

  it('goes on with no layer when nothing was painted', async () => {
    const onDone = open();

    fireEvent.click(screen.getByRole('button', { name: 'Texto y dibujo' }));
    await screen.findByTestId('painter');
    act(() => painter.props.onPost(new Blob(['png'])));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1]).toEqual({ layer: null, elements: [] });
  });
});
