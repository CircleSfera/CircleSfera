import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FRAME_MIN_DURATION_SEC } from '../../constants/uploadLimits';
import { renderWithProviders } from '../../test/test-utils';
import { PHOTO_FILTERS } from '../photo-editor/photoEditor.constants';
import FrameClipsEditor from './FrameClipsEditor';
import { NO_FRAME_FILTER } from './FrameFilterPanel';
import { frameLookCss, frameLookOf } from './frameLook';

const MOON =
  PHOTO_FILTERS.find((filter) => filter.name === 'Moon')?.class ?? '';

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
  it('shows one clip at a time, gone through with the arrows', () => {
    open();
    expect(screen.getByText('Clip 1 de 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clip anterior' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Clip siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clip siguiente' }));

    expect(screen.getByText('Clip 3 de 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clip siguiente' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clip anterior' }));
    expect(screen.getByText('Clip 2 de 3')).toBeInTheDocument();
  });

  it('has nothing to go through or order with one clip', () => {
    open([clip('a', FRAME_MIN_DURATION_SEC * 1000)]);
    expect(screen.queryByRole('button', { name: 'Ordenar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clip siguiente' })).toBeNull();
  });

  it('keeps showing the clip it showed after the order changes', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clip siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar' }));
    // The clip shown (b) goes first.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Mover Clip 2 de 3' }),
      { key: 'ArrowUp' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.getByText('Clip 1 de 3')).toBeInTheDocument();
  });

  it('goes on with the clips in the order and windows chosen', () => {
    const onDone = open();

    // The last clip, moved a place earlier in the order.
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar' }));
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Mover Clip 3 de 3' }),
      { key: 'ArrowUp' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
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

    const start = screen.getByRole('slider', { name: 'Inicio del clip' });
    for (let i = 0; i < 10; i++)
      fireEvent.keyDown(start, { key: 'ArrowRight' });
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
      filter: NO_FRAME_FILTER,
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

    expect(onDone.mock.calls[0][1]).toEqual({
      layer,
      elements,
      filter: NO_FRAME_FILTER,
    });
  });

  it('goes on with no layer when nothing was painted', async () => {
    const onDone = open();

    fireEvent.click(screen.getByRole('button', { name: 'Texto y dibujo' }));
    await screen.findByTestId('painter');
    act(() => painter.props.onPost(new Blob(['png'])));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1]).toEqual({
      layer: null,
      elements: [],
      filter: NO_FRAME_FILTER,
    });
  });

  it('gives the whole Frame one filter from the strip, with its strength, shown on the video', () => {
    const onDone = open();

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
    const strength = screen.getByRole('slider', { name: /Intensidad/ });
    fireEvent.change(strength, { target: { value: '50' } });
    expect(screen.getByTestId('frame-clips-video').style.filter).toBe(
      frameLookCss(frameLookOf(MOON, 50)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hecho' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1].filter).toEqual({
      filterClass: MOON,
      strength: 50,
    });
  });

  it('changes the filter with a swipe across the video, and names it for a moment', () => {
    vi.useFakeTimers();
    try {
      open();
      const video = screen.getByTestId('frame-clips-video');

      fireEvent.pointerDown(video, { clientX: 300 });
      fireEvent.pointerUp(video, { clientX: 200 });
      expect(screen.getByText(PHOTO_FILTERS[1].name)).toBeTruthy();
      expect(video.style.filter).toBe(
        frameLookCss(frameLookOf(PHOTO_FILTERS[1].class)),
      );

      // Back the other way, and a small move changes nothing.
      fireEvent.pointerDown(video, { clientX: 200 });
      fireEvent.pointerUp(video, { clientX: 300 });
      fireEvent.pointerDown(video, { clientX: 200 });
      fireEvent.pointerUp(video, { clientX: 220 });
      expect(video.style.filter).toBe(frameLookCss(frameLookOf('')));

      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByText(PHOTO_FILTERS[0].name)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens again with the filter chosen before', () => {
    const onDone = vi.fn();
    renderWithProviders(
      <FrameClipsEditor
        clips={[clip('a', half), clip('b', half)]}
        painting={{
          layer: null,
          elements: [],
          filter: { filterClass: MOON, strength: 30 },
        }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
      { lng: 'es' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(onDone.mock.calls[0][1].filter).toEqual({
      filterClass: MOON,
      strength: 30,
    });
  });
});
