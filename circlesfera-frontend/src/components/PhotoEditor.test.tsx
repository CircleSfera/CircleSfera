import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayElement } from '../services/edits.service';
import { renderWithProviders } from '../test/test-utils';
import PhotoEditor from './PhotoEditor';

// The cropper and the drawing layer draw on a canvas the test DOM does not
// have. They are replaced by stand-ins that show what they were given and
// report back the way the real ones do.
vi.mock('react-easy-crop', () => ({
  default: (props: {
    aspect?: number;
    rotation: number;
    onCropComplete: (area: unknown, pixels: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid="cropper"
      data-aspect={String(props.aspect)}
      data-rotation={props.rotation}
      onClick={() =>
        props.onCropComplete({}, { x: 10, y: 20, width: 300, height: 400 })
      }
    >
      crop
    </button>
  ),
}));

vi.mock('./CanvasOverlay', () => ({
  default: (props: {
    overlays: OverlayElement[];
    drawMode: boolean;
    brushSize: number;
    onSelectOverlay: (id: string | null) => void;
  }) => (
    <div data-testid="overlay-layer" data-draw={String(props.drawMode)}>
      {props.overlays.map((overlay) => (
        <button
          type="button"
          key={overlay.id}
          onClick={() => props.onSelectOverlay(overlay.id)}
        >
          overlay {overlay.text}
        </button>
      ))}
    </div>
  ),
}));

const photo = () => new File(['x'], 'photo.png', { type: 'image/png' });
const clip = () => new File(['x'], 'clip.mp4', { type: 'video/mp4' });

const NEUTRAL_STYLE =
  'brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)';

function renderEditor(
  props: Partial<React.ComponentProps<typeof PhotoEditor>> = {},
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const onStateChange = vi.fn();
  renderWithProviders(
    <PhotoEditor
      image={photo()}
      onSave={onSave}
      onCancel={onCancel}
      onStateChange={onStateChange}
      {...props}
    />,
    { lng: 'es' },
  );
  return { onSave, onCancel, onStateChange };
}

const tab = (name: string) => screen.getByRole('tab', { name });

/** Opens a tab and waits for its panel: the previous one animates out first. */
async function openTab(name: string, ready: () => Promise<unknown>) {
  fireEvent.click(tab(name));
  await ready();
}
const slider = () => screen.findByRole('slider');
const button = (name: string) => screen.findByRole('button', { name });
const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

describe('PhotoEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('a photo', () => {
    it('offers filters, adjust, crop and layer, opening on filters', () => {
      renderEditor();

      expect(
        screen.getAllByRole('tab').map((item) => item.textContent),
      ).toEqual(['Filtros', 'Ajustar', 'Recorte', 'Capa']);
      expect(tab('Filtros')).toHaveAttribute('aria-selected', 'true');
      expect(
        screen.getByRole('button', { name: 'Clarendon' }),
      ).toBeInTheDocument();
    });

    it('saves the untouched photo with no filter, neutral adjustments and no crop', () => {
      const { onSave } = renderEditor();

      save();

      const [file, filter, crop, , video] = onSave.mock.calls[0];
      expect(file.name).toBe('photo.png');
      expect(filter).toBe(
        `filter-class:__style:${NEUTRAL_STYLE}__temp:100__vignette:0__noise:0`,
      );
      expect(crop).toBeUndefined();
      expect(video).toBeUndefined();
    });

    it('saves the chosen filter', () => {
      const { onSave } = renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
      save();

      expect(onSave.mock.calls[0][1]).toContain(
        'filter-class:grayscale brightness-110 contrast-110__style:',
      );
    });

    it('opens on the filter and adjustments it was given', () => {
      const { onSave } = renderEditor({
        initialState: {
          filter: 'grayscale brightness-110 contrast-110',
          adjustments: {
            brightness: 120,
            contrast: 100,
            saturation: 100,
            sepia: 0,
            grayscale: 0,
            hue: 0,
            blur: 0,
            temperature: 100,
            vignette: 30,
            noise: 0,
          },
        },
      });

      save();

      expect(onSave.mock.calls[0][1]).toBe(
        'filter-class:grayscale brightness-110 contrast-110__style:brightness(120%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)__temp:100__vignette:30__noise:0',
      );
    });

    it('changes one adjustment at a time and saves them all', async () => {
      const { onSave } = renderEditor();

      await openTab('Ajustar', slider);
      fireEvent.change(screen.getByRole('slider'), {
        target: { value: '130' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Viñeta' }));
      fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Temperatura' }));
      fireEvent.change(screen.getByRole('slider'), {
        target: { value: '150' },
      });
      save();

      expect(onSave.mock.calls[0][1]).toBe(
        'filter-class:__style:brightness(130%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) hue-rotate(0deg) blur(0px)__temp:150__vignette:40__noise:0',
      );
    });

    it('offers to reset only once something is adjusted, and resets everything', async () => {
      const { onSave } = renderEditor();

      await openTab('Ajustar', slider);
      expect(
        screen.queryByRole('button', { name: 'Restablecer' }),
      ).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole('slider'), {
        target: { value: '130' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
      save();

      expect(onSave.mock.calls[0][1]).toContain(`__style:${NEUTRAL_STYLE}__`);
    });

    it('crops to the chosen shape and rotation, and saves the crop', async () => {
      const { onSave } = renderEditor();

      await openTab('Recorte', () => button('4:5'));
      expect(screen.getByTestId('cropper')).toHaveAttribute(
        'data-aspect',
        'undefined',
      );

      fireEvent.click(screen.getByRole('button', { name: '4:5' }));
      expect(screen.getByTestId('cropper')).toHaveAttribute(
        'data-aspect',
        '0.8',
      );

      fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } });
      fireEvent.click(screen.getByTestId('cropper'));
      save();

      expect(onSave.mock.calls[0][2]).toEqual({
        x: 10,
        y: 20,
        width: 300,
        height: 400,
        rotation: 90,
      });
    });

    it('adds a text and an emoji to the layer and deletes the selected one', async () => {
      const { onStateChange } = renderEditor();
      const overlays = (): OverlayElement[] =>
        onStateChange.mock.calls.at(-1)?.[0].overlays ?? [];

      await openTab('Capa', () => button('+ Texto'));
      fireEvent.click(screen.getByRole('button', { name: '+ Texto' }));
      fireEvent.click(screen.getByRole('button', { name: '🔥' }));

      expect(overlays().map((o) => o.text)).toEqual(['Nuevo texto', '🔥']);
      expect(
        screen.queryByRole('button', { name: 'Eliminar' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'overlay 🔥' }));
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

      expect(overlays().map((o) => o.text)).toEqual(['Nuevo texto']);
    });

    it('shows the brush controls only while drawing, and adding text stops drawing', async () => {
      renderEditor();

      await openTab('Capa', () => button('+ Texto'));
      expect(
        screen.queryByLabelText('Grosor del pincel'),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Dibujar' }));
      expect(screen.getByTestId('overlay-layer')).toHaveAttribute(
        'data-draw',
        'true',
      );
      expect(screen.getByLabelText('Grosor del pincel')).toBeInTheDocument();
      expect(screen.getByLabelText('Color del pincel')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '+ Texto' }));
      expect(screen.getByTestId('overlay-layer')).toHaveAttribute(
        'data-draw',
        'false',
      );
    });

    it('reports its state to the owner as it changes', () => {
      const { onStateChange } = renderEditor();

      fireEvent.click(screen.getByRole('button', { name: 'Moon' }));

      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filter: 'grayscale brightness-110 contrast-110',
          overlays: [],
          cropData: null,
        }),
      );
    });

    it('offers "apply to all" only when there are more files, with the current look', () => {
      const onApplyToAll = vi.fn();
      renderEditor({ onApplyToAll });

      fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar a todos' }));

      expect(onApplyToAll).toHaveBeenCalledWith(
        `filter-class:grayscale brightness-110 contrast-110__style:${NEUTRAL_STYLE}__temp:100__vignette:0__noise:0`,
      );
    });

    it('has no "apply to all" for a single file, and cancels from the X', () => {
      const { onCancel } = renderEditor();

      expect(
        screen.queryByRole('button', { name: 'Aplicar a todos' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('names its sliders, so a screen reader says what each one changes', async () => {
    renderEditor();

    await openTab('Ajustar', slider);
    expect(screen.getByRole('slider', { name: 'Brillo' })).toHaveAttribute(
      'aria-valuetext',
      '100%',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viñeta' }));
    expect(screen.getByRole('slider', { name: 'Viñeta' })).toBeInTheDocument();

    await openTab('Recorte', () => button('4:5'));
    expect(screen.getByRole('slider', { name: 'Rotación' })).toHaveAttribute(
      'aria-valuetext',
      '0°',
    );
  });

  it('gives each new layer item its own id', async () => {
    const { onStateChange } = renderEditor();

    await openTab('Capa', () => button('+ Texto'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));

    const ids = onStateChange.mock.calls
      .at(-1)?.[0]
      .overlays.map((overlay: OverlayElement) => overlay.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  describe('the temporary address of the file', () => {
    const made = () => vi.mocked(URL.createObjectURL).mock.calls.length;

    it('is made once, however many times the editor redraws', async () => {
      renderEditor();
      const afterOpening = made();

      fireEvent.click(screen.getByRole('button', { name: 'Moon' }));
      await openTab('Ajustar', slider);
      fireEvent.change(await slider(), { target: { value: '130' } });

      expect(made()).toBe(afterOpening);
      expect(screen.getByAltText(/.+/)).toHaveAttribute('src', 'blob:preview');
    });

    it('is released when the editor closes', () => {
      const onSave = vi.fn();
      const { unmount } = renderWithProviders(
        <PhotoEditor image={photo()} onSave={onSave} onCancel={vi.fn()} />,
        { lng: 'es' },
      );
      expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview');

      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });
  });

  describe('a video', () => {
    it('offers trim instead of crop and layer', () => {
      renderEditor({ image: clip() });

      expect(
        screen.getAllByRole('tab').map((item) => item.textContent),
      ).toEqual(['Filtros', 'Ajustar', 'Recortar']);
    });

    it('opens on trim when asked to', () => {
      renderEditor({ image: clip(), initialTab: 'TRIM' });

      expect(tab('Recortar')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Audio')).toBeInTheDocument();
    });

    it('saves the trim and whether the sound is off', () => {
      const { onSave } = renderEditor({
        image: clip(),
        initialTab: 'TRIM',
        initialState: {
          videoData: { startTime: 2, endTime: 12, muted: false },
        },
      });

      const mute = screen.getByRole('button', { name: 'Con sonido' });
      expect(mute).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(mute);
      expect(
        screen.getByRole('button', { name: 'Silenciado' }),
      ).toHaveAttribute('aria-pressed', 'true');

      expect(
        screen.getByRole('slider', { name: 'Inicio del clip' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('slider', { name: 'Fin del clip' }),
      ).toBeInTheDocument();
      const [start] = screen.getAllByRole('slider');
      fireEvent.change(start, { target: { value: '4' } });
      save();

      expect(onSave.mock.calls[0][4]).toEqual({
        startTime: 4,
        endTime: 12,
        muted: true,
      });
      expect(screen.getByText('Recortar (8.0s)')).toBeInTheDocument();
    });

    it('does not let the start pass the end, nor the end go before the start', () => {
      const { onSave } = renderEditor({
        image: clip(),
        initialTab: 'TRIM',
        initialState: {
          videoData: { startTime: 2, endTime: 12, muted: false },
        },
      });

      const [start, end] = screen.getAllByRole('slider');
      fireEvent.change(start, { target: { value: '20' } });
      fireEvent.change(end, { target: { value: '1' } });
      save();

      expect(onSave.mock.calls[0][4]).toMatchObject({
        startTime: 2,
        endTime: 12,
      });
    });

    it('keeps a frame clip inside the allowed length', () => {
      const { onSave } = renderEditor({
        image: clip(),
        initialTab: 'TRIM',
        constrainDuration: { min: 15, max: 90 },
        initialState: {
          videoData: { startTime: 0, endTime: 200, muted: false },
        },
      });

      save();

      const video = onSave.mock.calls[0][4];
      expect(video.endTime - video.startTime).toBeLessThanOrEqual(90);
      expect(video.endTime - video.startTime).toBeGreaterThanOrEqual(15);
    });
  });
});
