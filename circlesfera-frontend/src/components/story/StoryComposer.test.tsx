import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { StoryElement } from '../../types';
import StoryComposer from './StoryComposer';
import { GRADIENTS } from './storyComposer.constants';
import { exportStoryCanvas } from './storyComposer.export';
import { parsePollPayload, parseQnaPayload } from './storyInteractive';

vi.mock('./storyComposer.export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storyComposer.export')>()),
  exportStoryCanvas: vi.fn(),
}));

function renderComposer(
  props: Partial<React.ComponentProps<typeof StoryComposer>> = {},
) {
  const onPost = vi.fn();
  const onClose = vi.fn();
  const onElementsChange = vi.fn();
  const { container } = renderWithProviders(
    <StoryComposer
      onPost={onPost}
      onClose={onClose}
      onElementsChange={onElementsChange}
      {...props}
    />,
    { lng: 'es' },
  );
  const lastElements = (): StoryElement[] =>
    onElementsChange.mock.calls.at(-1)?.[0] ?? [];
  return { onPost, onClose, lastElements, container };
}

const tool = (name: string) =>
  within(
    screen.getByRole('toolbar', { name: 'Herramientas de historia' }),
  ).getByRole('button', { name });

/** The test DOM has no `innerText`, which the text editor reads on input. */
function typeStoryText(text: string) {
  const editor = screen.getByRole('textbox', { name: 'Escribe algo…' });
  editor.innerText = text;
  fireEvent.input(editor);
}

describe('StoryComposer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.mocked(exportStoryCanvas).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens with its tools, nothing to undo and the story ready to share', () => {
    renderComposer();

    for (const name of [
      'Fondo',
      'Texto',
      'Stickers',
      'Plantillas',
      'Dibujar',
      'Más',
    ]) {
      expect(tool(name)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rehacer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled();
  });

  it('closes from the X', () => {
    const { onClose } = renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the open tool as pressed and releases it when tapped again', () => {
    renderComposer();

    fireEvent.click(tool('Stickers'));
    expect(tool('Stickers')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Caras' })).toBeInTheDocument();

    fireEvent.click(tool('Stickers'));
    expect(tool('Stickers')).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds a sticker from the panel, and undo and redo take it away and bring it back', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0]).toMatchObject({ type: 'sticker', content: '🔥' });
    expect(screen.getByText('Editar sticker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(lastElements()).toHaveLength(0));

    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));
    await waitFor(() => expect(lastElements()).toHaveLength(1));
  });

  it('deletes the selected sticker from its edit panel', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    await waitFor(() => expect(lastElements()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(lastElements()).toHaveLength(0));
    expect(screen.queryByText('Editar sticker')).not.toBeInTheDocument();
  });

  it('writes a text in text mode and adds it with "Listo"', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Texto'));
    typeStoryText('Hola mundo');
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0]).toMatchObject({
      type: 'text',
      content: 'Hola mundo',
    });
    expect(
      screen.getByRole('toolbar', { name: 'Herramientas de historia' }),
    ).toBeInTheDocument();
  });

  it('adds no text when text mode is cancelled', () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Texto'));
    typeStoryText('descartado');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(lastElements()).toHaveLength(0);
  });

  it('adds a poll from the "Más" menu only once it has a question', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Más'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Encuesta' }));

    const add = screen.getByRole('button', { name: 'Añadir encuesta' });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Escribe tu pregunta…'), {
      target: { value: '¿Playa o montaña?' },
    });
    fireEvent.click(add);

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(parsePollPayload(lastElements()[0].content)).toEqual({
      question: '¿Playa o montaña?',
      options: ['Sí', 'No'],
    });
  });

  it('adds a question box from the "Más" menu', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Más'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preguntas' }));
    fireEvent.change(
      screen.getByPlaceholderText('Pregúntame lo que quieras…'),
      { target: { value: '¿Qué queréis saber?' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^Añadir/ }));

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(parseQnaPayload(lastElements()[0].content)).toEqual({
      prompt: '¿Qué queréis saber?',
    });
  });

  it('fills the story from a template', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Plantillas'));
    fireEvent.click(screen.getByRole('button', { name: /Quote/ }));

    await waitFor(() => expect(lastElements().length).toBeGreaterThan(0));
    expect(lastElements()[0]).toMatchObject({ type: 'text' });
  });

  it('shares the story as an image and shows the button as busy meanwhile', async () => {
    let finish: () => void = () => {};
    vi.mocked(exportStoryCanvas).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    await waitFor(() => expect(exportStoryCanvas).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Listo' })).toBeDisabled();

    finish();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled(),
    );
  });

  describe('background panel', () => {
    it('names each background and marks the chosen one', () => {
      const onBgStyleChange = vi.fn();
      renderComposer({ onBgStyleChange });

      fireEvent.click(tool('Fondo'));
      expect(screen.getByRole('button', { name: 'Fondo 1' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Fondo 3' }));

      expect(screen.getByRole('button', { name: 'Fondo 3' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(onBgStyleChange).toHaveBeenLastCalledWith(GRADIENTS[2]);
    });

    it('offers blur and darken only when the background is a photo', () => {
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });
      renderComposer({ initialMedia: photo, bgStyle: '' });

      fireEvent.click(tool('Fondo'));
      const blur = screen.getByRole('slider', { name: 'Desenfoque' });
      fireEvent.change(blur, { target: { value: '6' } });

      expect(blur).toHaveValue('6');
      expect(
        screen.getByRole('slider', { name: 'Oscurecer' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fondo 2' }));
      expect(
        screen.queryByRole('slider', { name: 'Desenfoque' }),
      ).not.toBeInTheDocument();
    });

    it('takes a photo chosen from the device as the background', async () => {
      const onBackgroundChange = vi.fn();
      const { container } = renderComposer({ onBackgroundChange });
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });

      fireEvent.change(
        container.ownerDocument.querySelector('input[type="file"]') as Element,
        { target: { files: [photo] } },
      );

      await waitFor(() =>
        expect(onBackgroundChange).toHaveBeenCalledWith(photo),
      );
    });
  });

  describe('draw panel', () => {
    it('sets the brush width and colour', () => {
      renderComposer();

      fireEvent.click(tool('Dibujar'));
      const width = screen.getByRole('slider', { name: 'Grosor' });
      fireEvent.change(width, { target: { value: '12' } });
      fireEvent.click(screen.getByRole('button', { name: '#FF3B30' }));

      expect(width).toHaveValue('12');
      expect(screen.getByRole('button', { name: '#FF3B30' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(
        screen.getByRole('button', { name: 'Borrar dibujo' }),
      ).toBeInTheDocument();
    });
  });

  describe('editing an element', () => {
    async function withSticker() {
      const utils = renderComposer();
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: '🔥' }));
      await waitFor(() => expect(utils.lastElements()).toHaveLength(1));
      return utils;
    }

    it('shows its three sections under translated names', async () => {
      await withSticker();

      for (const name of ['Estilo', 'Transformar', 'Capas']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: 'Estilo' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('duplicates the element and then puts the copy behind the original', async () => {
      const { lastElements } = await withSticker();
      const originalId = lastElements()[0].id;

      fireEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
      await waitFor(() => expect(lastElements()).toHaveLength(2));
      expect(lastElements()[0].id).toBe(originalId);

      // The copy is selected and on top; send it one layer back.
      fireEvent.click(screen.getByRole('button', { name: 'Enviar atrás' }));
      await waitFor(() => expect(lastElements()[1].id).toBe(originalId));

      fireEvent.click(screen.getByRole('button', { name: 'Traer adelante' }));
      await waitFor(() => expect(lastElements()[0].id).toBe(originalId));
    });

    it('changes size, rotation and opacity from "Transformar" and centres the element', async () => {
      const { lastElements } = await withSticker();

      fireEvent.click(screen.getByRole('button', { name: 'Transformar' }));
      fireEvent.change(screen.getByRole('slider', { name: 'Rotación' }), {
        target: { value: '45' },
      });
      fireEvent.change(screen.getByRole('slider', { name: 'Opacidad' }), {
        target: { value: '0.5' },
      });

      await waitFor(() =>
        expect(lastElements()[0]).toMatchObject({ rotation: 45 }),
      );
      expect(lastElements()[0].opacity).toBeLessThan(1);
      expect(
        screen.getByRole('slider', { name: 'Tamaño' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Centrar' }));
      await waitFor(() =>
        expect(lastElements()[0]).toMatchObject({ x: 0, y: 0 }),
      );
    });

    it('lists every element under "Capas" with named controls to reorder, copy and delete', async () => {
      const { lastElements } = await withSticker();

      fireEvent.click(screen.getByRole('button', { name: 'Capas' }));
      // The header and the row both offer "Duplicar": the row one comes last.
      fireEvent.click(screen.getAllByRole('button', { name: 'Duplicar' })[1]);
      await waitFor(() => expect(lastElements()).toHaveLength(2));

      const removeButtons = screen.getAllByRole('button', { name: 'Eliminar' });
      fireEvent.click(removeButtons[removeButtons.length - 1]);
      await waitFor(() => expect(lastElements()).toHaveLength(1));
    });

    it('undoes a slider change as one step, back to the value before the drag', async () => {
      const { lastElements } = await withSticker();

      fireEvent.click(screen.getByRole('button', { name: 'Transformar' }));
      const rotation = screen.getByRole('slider', { name: 'Rotación' });
      // A drag: many values, then the pointer is released.
      fireEvent.change(rotation, { target: { value: '10' } });
      fireEvent.change(rotation, { target: { value: '25' } });
      fireEvent.change(rotation, { target: { value: '45' } });
      fireEvent.pointerUp(rotation);
      await waitFor(() => expect(lastElements()[0].rotation).toBe(45));

      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
      await waitFor(() => expect(lastElements()[0].rotation).toBe(0));
      // The sticker itself is still there: only the rotation was undone.
      expect(lastElements()).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));
      await waitFor(() => expect(lastElements()[0].rotation).toBe(45));
    });

    it('undoes a slider moved with the keyboard', async () => {
      const { lastElements } = await withSticker();

      fireEvent.click(screen.getByRole('button', { name: 'Transformar' }));
      const rotation = screen.getByRole('slider', { name: 'Rotación' });
      fireEvent.change(rotation, { target: { value: '5' } });
      fireEvent.keyUp(rotation, { key: 'ArrowRight' });
      await waitFor(() => expect(lastElements()[0].rotation).toBe(5));

      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
      await waitFor(() => expect(lastElements()[0].rotation).toBe(0));
    });

    it('closes the edit panel and keeps the element', async () => {
      const { lastElements } = await withSticker();

      const closeButtons = screen.getAllByRole('button', { name: 'Cerrar' });
      fireEvent.click(closeButtons[closeButtons.length - 1]);

      await waitFor(() =>
        expect(screen.queryByText('Editar sticker')).not.toBeInTheDocument(),
      );
      expect(lastElements()).toHaveLength(1);
    });
  });

  describe('text mode controls', () => {
    it('applies the chosen colour, style and alignment to the new text', async () => {
      const { lastElements } = renderComposer();

      fireEvent.click(tool('Texto'));
      typeStoryText('Hola');
      fireEvent.click(screen.getByRole('button', { name: 'Neón' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Alinear a la izquierda' }),
      );
      fireEvent.click(
        screen.getAllByRole('button', { name: /^Color de texto / })[1],
      );
      fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0]).toMatchObject({
        content: 'Hola',
        textStyle: 'neon',
        align: 'left',
      });
      expect(lastElements()[0].color).not.toBe('#FFFFFF');
    });

    it('opens the type options with font, gradient, size, spacing and width', async () => {
      const { lastElements } = renderComposer();

      fireEvent.click(tool('Texto'));
      typeStoryText('Hola');
      fireEvent.click(screen.getByRole('button', { name: 'Opciones de tipo' }));

      fireEvent.change(screen.getByRole('slider', { name: 'Tamaño' }), {
        target: { value: '40' },
      });
      fireEvent.change(screen.getByRole('slider', { name: 'Espaciado' }), {
        target: { value: '2' },
      });
      expect(screen.getByRole('slider', { name: 'Ancho' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Color sólido' }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0]).toMatchObject({
        fontSize: 40,
        letterSpacing: 2,
      });
    });
  });
});
