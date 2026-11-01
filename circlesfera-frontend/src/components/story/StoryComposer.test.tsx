import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import type { StoryElement } from '../../types';
import StoryComposer from './StoryComposer';
import { buildHashtagElement } from './storyComposer.append';
import { GRADIENTS } from './storyComposer.constants';
import { exportStoryCanvas } from './storyComposer.export';
import { parsePollPayload, parseQnaPayload } from './storyInteractive';

vi.mock('../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services')>();
  return {
    ...actual,
    searchApi: { ...actual.searchApi, searchUsers: vi.fn() },
  };
});

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
  // biome-ignore lint/performance/useDomNodeTextContent: the editor reads innerText, so the test sets it
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
    ]) {
      expect(tool(name)).toBeInTheDocument();
    }
    // Polls and the rest are in the sticker tray now.
    expect(
      screen.queryByRole('button', { name: 'Más' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rehacer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled();
  });

  it('keeps the tools in one column and the story ready to finish while a piece is edited', async () => {
    renderComposer();
    expect(
      screen.getByRole('toolbar', { name: 'Herramientas de historia' }),
    ).toHaveAttribute('aria-orientation', 'vertical');

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));

    expect(
      await screen.findByRole('button', { name: 'Estilo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Listo' })).toBeEnabled();
    expect(tool('Texto')).toBeInTheDocument();
  });

  it('opens the panel of a tool even while a piece is selected', async () => {
    renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    expect(
      await screen.findByRole('button', { name: 'Estilo' }),
    ).toBeInTheDocument();

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Preguntas' }));

    expect(
      screen.getByPlaceholderText('Pregúntame lo que quieras…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Estilo' }),
    ).not.toBeInTheDocument();
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

  it('ends the text with a tap outside it, the same as "Listo"', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Texto'));
    typeStoryText('Hola fuera');
    expect(
      screen.queryByRole('button', { name: 'Cancelar' }),
    ).not.toBeInTheDocument();
    const canvas = screen.getByTestId('story-canvas');
    fireEvent.pointerDown(canvas);
    fireEvent.click(canvas);

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0]).toMatchObject({ content: 'Hola fuera' });
    // The tap that ended the text does not start another one.
    expect(screen.queryByTestId('story-text-mode')).not.toBeInTheDocument();
  });

  it('ends the text with Escape, the same as "Listo"', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Texto'));
    typeStoryText('Hola tecla');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Escribe algo…' }), {
      key: 'Escape',
    });

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0]).toMatchObject({ content: 'Hola tecla' });
  });

  it('adds nothing when an empty text is ended', () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Texto'));
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

    expect(lastElements()).toHaveLength(0);
    expect(screen.queryByTestId('story-text-mode')).not.toBeInTheDocument();
  });

  it('keeps writing when a control of text mode is tapped', () => {
    renderComposer();

    fireEvent.click(tool('Texto'));
    const editor = screen.getByRole('textbox', { name: 'Escribe algo…' });
    expect(editor).toHaveFocus();
    // The control does not take the focus, so the keyboard stays open.
    for (const control of [
      screen.getByRole('button', { name: 'Playfair' }),
      screen.getByRole('button', { name: 'Colores' }),
      screen.getByRole('button', { name: 'Alinear a la izquierda' }),
    ]) {
      expect(fireEvent.pointerDown(control)).toBe(false);
      expect(fireEvent.mouseDown(control)).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Playfair' }));
    expect(screen.getByTestId('story-text-mode')).toBeInTheDocument();
    expect(editor).toHaveFocus();
  });

  describe('focus within the tap, which a phone needs to open its keyboard', () => {
    const actEnvironment = (on: boolean) => {
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = on;
    };
    afterEach(() => actEnvironment(true));

    /** A real tap: the browser's own event, nothing flushed after it. */
    const tap = (target: Element) => {
      target.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    };

    it('focuses the text before the tap on "Texto" returns', async () => {
      renderComposer();
      actEnvironment(false);

      tap(tool('Texto'));

      // Checked in the same tick as the tap, before anything else runs.
      const focused = document.activeElement;
      expect(focused).toHaveAttribute('role', 'textbox');
      expect(focused).toHaveAttribute('contenteditable', 'true');
      await act(async () => {});
    });

    it('opens a text with a tap on the story, focused before the tap returns', async () => {
      renderComposer();
      actEnvironment(false);

      tap(screen.getByTestId('story-canvas'));

      expect(document.activeElement).toHaveAttribute('role', 'textbox');
      await act(async () => {});
      expect(screen.getByTestId('story-text-mode')).toBeInTheDocument();
    });

    it('focuses an existing text within the tap that opens it', async () => {
      const text: StoryElement = {
        id: 'hola',
        type: 'text',
        content: 'Hola',
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      };
      renderComposer({ elements: [text] });
      actEnvironment(false);
      const piece = screen.getByTestId('story-element');

      piece.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

      const focused = document.activeElement;
      expect(focused).toHaveAttribute('role', 'textbox');
      expect(focused).toHaveTextContent('Hola');
      await act(async () => {});
    });
  });

  it('does not start a text from a tap on the story while a piece is selected', async () => {
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    await waitFor(() => expect(lastElements()).toHaveLength(1));

    const canvas = screen.getByTestId('story-canvas');
    fireEvent.pointerDown(canvas);
    fireEvent.click(canvas);

    expect(screen.queryByTestId('story-text-mode')).not.toBeInTheDocument();
  });

  it('adds a poll from the sticker tray only once it has a question', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Encuesta' }));
    expect(tool('Stickers')).toHaveAttribute('aria-pressed', 'true');

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
    // Answered on the story itself, so it is left out of the picture.
    expect(screen.getByTestId('story-element')).toHaveAttribute(
      'data-export-ignore',
      'true',
    );
  });

  it('adds a question box from the sticker tray', async () => {
    const { lastElements } = renderComposer();

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Preguntas' }));
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

  it('adds a poll with up to four answers, and takes one away', async () => {
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Encuesta' }));
    fireEvent.change(screen.getByPlaceholderText('Escribe tu pregunta…'), {
      target: { value: '¿Dónde?' },
    });

    const add = () => screen.getByRole('button', { name: 'Añadir opción' });
    fireEvent.click(add());
    fireEvent.click(add());
    expect(
      screen.queryByRole('button', { name: 'Añadir opción' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Opción 3' }), {
      target: { value: 'Playa' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Opción 4' }), {
      target: { value: 'Ciudad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar opción 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir encuesta' }));

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(parsePollPayload(lastElements()[0].content)?.options).toEqual([
      'Sí',
      'No',
      'Playa',
    ]);
  });

  it('adds a quiz with its right answer from the tray', async () => {
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    const add = screen.getByRole('button', { name: 'Añadir quiz' });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Haz una pregunta…'), {
      target: { value: '¿Capital?' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Opción 1' }), {
      target: { value: 'Roma' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Opción 2' }), {
      target: { value: 'Madrid' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar B como la correcta' }),
    );
    fireEvent.click(add);

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0].type).toBe('quiz');
    expect(JSON.parse(lastElements()[0].content)).toEqual({
      question: '¿Capital?',
      options: ['Roma', 'Madrid'],
      correctIndex: 1,
    });
  });

  it('adds one link from the tray, refuses a second, and offers it no copy', async () => {
    const refused = vi.spyOn(toast, 'error').mockImplementation(() => '');
    const { lastElements } = renderComposer();
    const addLink = () => {
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Enlace' }));
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Dirección del enlace' }),
        { target: { value: 'shop.example' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Añadir enlace' }));
    };

    addLink();
    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0].type).toBe('link');
    fireEvent.click(screen.getByRole('button', { name: 'Capas' }));
    expect(
      screen.queryByRole('button', { name: 'Duplicar' }),
    ).not.toBeInTheDocument();

    addLink();
    expect(refused).toHaveBeenCalledWith(
      'Una historia puede llevar un solo enlace',
    );
    expect(lastElements()).toHaveLength(1);
    refused.mockRestore();
  });

  it('adds a countdown from the tray, live on the story', async () => {
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Cuenta atrás' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Título de la cuenta atrás' }),
      { target: { value: 'Fiesta' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Añadir cuenta atrás' }),
    );

    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0].type).toBe('countdown');
    expect(JSON.parse(lastElements()[0].content).title).toBe('Fiesta');
    expect(screen.getByTestId('story-element')).toHaveAttribute(
      'data-export-ignore',
      'true',
    );
  });

  it('adds a slider with the chosen emoji, and a hashtag without its #', async () => {
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Deslizador' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Emoji del deslizador: 🔥' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Añadir deslizador' }));
    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(JSON.parse(lastElements()[0].content)).toEqual({
      question: '',
      emoji: '🔥',
    });

    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Hashtag' }));
    const field = screen.getByRole('textbox', { name: 'Hashtag' });
    fireEvent.change(field, { target: { value: 'a-b' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Solo letras, números y _',
    );
    expect(
      screen.getByRole('button', { name: 'Añadir hashtag' }),
    ).toBeDisabled();
    fireEvent.change(field, { target: { value: '#verano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir hashtag' }));

    await waitFor(() => expect(lastElements()).toHaveLength(2));
    expect(lastElements()[1]).toMatchObject({
      type: 'hashtag',
      content: JSON.stringify({ tag: 'verano' }),
    });
  });

  it('mentions a person found by their name', async () => {
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [{ id: 'p-ana', username: 'ana', avatar: null }],
    } as never);
    const { lastElements } = renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Mención' }));
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Buscar personas' }),
      { target: { value: '@an' } },
    );

    fireEvent.click(await screen.findByRole('button', { name: /ana/ }));

    expect(searchApi.searchUsers).toHaveBeenCalledWith('an');
    await waitFor(() => expect(lastElements()).toHaveLength(1));
    expect(lastElements()[0]).toMatchObject({
      type: 'mention',
      content: JSON.stringify({ profileId: 'p-ana', username: 'ana' }),
    });
  });

  it('says when no one has that name', async () => {
    vi.mocked(searchApi.searchUsers).mockResolvedValue({ data: [] } as never);
    renderComposer();
    fireEvent.click(tool('Stickers'));
    fireEvent.click(screen.getByRole('button', { name: 'Mención' }));
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Buscar personas' }),
      { target: { value: 'zz' } },
    );

    expect(
      await screen.findByText('No hay nadie con ese nombre'),
    ).toBeInTheDocument();
  });

  it('holds ten interactive stickers at most: the tray says so, and emoji still go', async () => {
    const tags = Array.from({ length: 10 }, (_, i) => ({
      ...buildHashtagElement(`tag${i}`),
      id: `tag-${i}`,
    })) as StoryElement[];
    const { lastElements } = renderComposer({ elements: tags });

    fireEvent.click(tool('Stickers'));
    expect(
      screen.getByText('Una historia lleva hasta 10 stickers interactivos'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Encuesta' })).toBeDisabled();
    // Emoji are part of the picture, not stickers of the story.
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    await waitFor(() => expect(lastElements()).toHaveLength(11));
  });

  it('offers a location only when the editor shares the story, as it is the story’s place', () => {
    renderComposer();
    fireEvent.click(tool('Stickers'));
    expect(
      screen.queryByRole('button', { name: 'Ubicación' }),
    ).not.toBeInTheDocument();
  });

  it('searches the tray by the name of a sticker or of an emoji category', () => {
    renderComposer();
    fireEvent.click(tool('Stickers'));
    const search = screen.getByRole('searchbox', { name: 'Buscar stickers' });

    fireEvent.change(search, { target: { value: 'quiz' } });
    expect(screen.getByRole('button', { name: 'Quiz' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Encuesta' }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(
      screen.getByText('No hay stickers con ese nombre'),
    ).toBeInTheDocument();
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

  describe('sharing from the editor', () => {
    const share = (over = {}) => ({
      closeFriendsCount: 2,
      onManageCloseFriends: vi.fn(),
      isSharing: false,
      musicTitle: null,
      onOpenMusic: vi.fn(),
      placeName: null,
      placeStickerName: null,
      onOpenPlace: vi.fn(),
      ...over,
    });

    it('shares to your story or to close friends in one tap, instead of "Listo"', async () => {
      vi.mocked(exportStoryCanvas).mockImplementation(async (o) => {
        await o.onPost(new Blob(['png']), { width: 360, height: 640 });
      });
      const { onPost } = renderComposer({ share: share() });
      expect(
        screen.queryByRole('button', { name: 'Listo' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Tu historia' }));
      await waitFor(() =>
        expect(onPost).toHaveBeenLastCalledWith(
          expect.any(Blob),
          { width: 360, height: 640 },
          'everyone',
          null,
        ),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Mejores amigos' }));
      await waitFor(() =>
        expect(onPost).toHaveBeenLastCalledWith(
          expect.any(Blob),
          { width: 360, height: 640 },
          'close_friends',
          null,
        ),
      );
    });

    it('opens the close friends list when it is empty, instead of sharing', () => {
      const options = share({ closeFriendsCount: 0 });
      const { onPost } = renderComposer({ share: options });

      fireEvent.click(screen.getByRole('button', { name: 'Mejores amigos' }));

      expect(options.onManageCloseFriends).toHaveBeenCalled();
      expect(onPost).not.toHaveBeenCalled();
    });

    it('keeps both buttons busy while the story is being shared', () => {
      renderComposer({ share: share({ isSharing: true }) });

      expect(
        screen.getByRole('button', { name: 'Tu historia' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Mejores amigos' }),
      ).toBeDisabled();
    });

    it('has music and place among the tools, and shows what was chosen on the story', () => {
      const options = share({ musicTitle: 'Song', placeName: 'Madrid' });
      renderComposer({ share: options });

      expect(tool('Añadir música')).toHaveAttribute('aria-pressed', 'true');
      expect(tool('Añadir lugar')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(
        screen.getByRole('button', { name: 'Añadir lugar: Madrid' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Añadir música: Song' }),
      );
      expect(options.onOpenPlace).toHaveBeenCalled();
      expect(options.onOpenMusic).toHaveBeenCalled();
    });
  });

  describe('the location sticker', () => {
    /** The editor in its screen, whose place picker sets Madrid. */
    function Sharing({
      initialPlace = null,
      onElementsChange,
    }: {
      initialPlace?: string | null;
      onElementsChange: (elements: StoryElement[]) => void;
    }) {
      const [placeName, setPlaceName] = useState<string | null>(initialPlace);
      return (
        <>
          <button type="button" onClick={() => setPlaceName(null)}>
            quitar lugar
          </button>
          <StoryComposer
            onPost={vi.fn()}
            onClose={vi.fn()}
            onElementsChange={onElementsChange}
            share={{
              closeFriendsCount: 0,
              onManageCloseFriends: vi.fn(),
              isSharing: false,
              musicTitle: null,
              onOpenMusic: vi.fn(),
              // The label with its area, and the place's own name.
              placeName: placeName ? `${placeName}, España` : null,
              placeStickerName: placeName,
              onOpenPlace: () => setPlaceName('Madrid'),
            }}
          />
        </>
      );
    }

    const renderSharing = (initialPlace: string | null = null) => {
      const onElementsChange = vi.fn();
      renderWithProviders(
        <Sharing
          initialPlace={initialPlace}
          onElementsChange={onElementsChange}
        />,
        { lng: 'es' },
      );
      return (): StoryElement[] =>
        onElementsChange.mock.calls.at(-1)?.[0] ?? [];
    };

    it('with no place yet, asks for one and is added once it is chosen', async () => {
      const lastElements = renderSharing();
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Ubicación' }));

      fireEvent.click(screen.getByRole('button', { name: 'Elegir lugar' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0]).toMatchObject({
        type: 'location',
        content: JSON.stringify({ name: 'Madrid' }),
      });
    });

    it('with a place, is added at once, once, and goes when the place is taken off', async () => {
      const lastElements = renderSharing('Sevilla');
      expect(
        screen.getByRole('button', { name: 'Añadir lugar: Sevilla, España' }),
      ).toBeInTheDocument();
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Ubicación' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Añadir sticker de ubicación' }),
      );
      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(JSON.parse(lastElements()[0].content)).toEqual({
        name: 'Sevilla',
      });
      // A story has one place: its sticker offers no copy.
      fireEvent.click(screen.getByRole('button', { name: 'Capas' }));
      expect(
        screen.queryByRole('button', { name: 'Duplicar' }),
      ).not.toBeInTheDocument();
      // The place shows once: as the sticker, not also as the chip.
      expect(
        screen.queryByRole('button', { name: 'Añadir lugar: Sevilla, España' }),
      ).not.toBeInTheDocument();

      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Ubicación' }));
      expect(
        screen.getByText('Tu historia ya muestra su lugar'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Añadir sticker de ubicación' }),
      ).not.toBeInTheDocument();

      // Another place renames it; no place takes it off.
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar lugar' }));
      await waitFor(() =>
        expect(JSON.parse(lastElements()[0].content)).toEqual({
          name: 'Madrid',
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'quitar lugar' }));
      await waitFor(() => expect(lastElements()).toHaveLength(0));
    });
  });

  describe('the music sticker', () => {
    const LUZ = { title: 'Luz', artist: 'Ana', cover: null };
    const MAR = { title: 'Mar', artist: 'Leo', cover: null };

    /** The editor in its screen, whose song picker chooses Luz. */
    function Sharing({
      initialTrack = null,
      onElementsChange,
    }: {
      initialTrack?: typeof LUZ | null;
      onElementsChange: (elements: StoryElement[]) => void;
    }) {
      const [track, setTrack] = useState(initialTrack);
      return (
        <>
          <button type="button" onClick={() => setTrack(null)}>
            quitar canción
          </button>
          <button type="button" onClick={() => setTrack(MAR)}>
            otra canción
          </button>
          <StoryComposer
            onPost={vi.fn()}
            onClose={vi.fn()}
            onElementsChange={onElementsChange}
            share={{
              closeFriendsCount: 0,
              onManageCloseFriends: vi.fn(),
              isSharing: false,
              musicTitle: track?.title ?? null,
              musicSticker: track,
              onOpenMusic: () => setTrack(LUZ),
              placeName: null,
              placeStickerName: null,
              onOpenPlace: vi.fn(),
            }}
          />
        </>
      );
    }

    const renderSharing = (initialTrack: typeof LUZ | null = null) => {
      const onElementsChange = vi.fn();
      renderWithProviders(
        <Sharing
          initialTrack={initialTrack}
          onElementsChange={onElementsChange}
        />,
        { lng: 'es' },
      );
      return (): StoryElement[] =>
        onElementsChange.mock.calls.at(-1)?.[0] ?? [];
    };

    it('with no song yet, asks for one and is added once it is chosen', async () => {
      const lastElements = renderSharing();
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Música' }));
      fireEvent.click(screen.getByRole('button', { name: 'Elegir canción' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0]).toMatchObject({
        type: 'music',
        content: JSON.stringify(LUZ),
      });
    });

    it('with a song, is added at once, hides the song chip, follows the song and goes with it', async () => {
      const lastElements = renderSharing(LUZ);
      expect(screen.getByRole('button', { name: /Luz/ })).toBeInTheDocument();
      fireEvent.click(tool('Stickers'));
      fireEvent.click(screen.getByRole('button', { name: 'Música' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Mostrar «Luz» en la historia' }),
      );
      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(screen.getByText('Luz')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /: Luz$/ }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'otra canción' }));
      await waitFor(() =>
        expect(JSON.parse(lastElements()[0].content).title).toBe('Mar'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'quitar canción' }));
      await waitFor(() => expect(lastElements()).toHaveLength(0));
    });

    it('is not offered when the editor does not share the story', () => {
      renderComposer();
      fireEvent.click(tool('Stickers'));
      expect(
        screen.queryByRole('button', { name: 'Música' }),
      ).not.toBeInTheDocument();
    });
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

    it('plays a video background as itself: no blur or darken, and never in the picture', () => {
      const clip = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
      renderComposer({ initialMedia: clip, bgStyle: '' });

      fireEvent.click(tool('Fondo'));

      expect(
        screen.queryByRole('slider', { name: 'Desenfoque' }),
      ).not.toBeInTheDocument();
      expect(document.querySelector('video')).toHaveAttribute(
        'data-export-ignore',
        'true',
      );
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

    it('edits the photo from the keyboard: arrows move it, + scales it, ] changes its filter, each undone', () => {
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });
      renderComposer({ initialMedia: photo, bgStyle: '' });
      const canvas = screen.getByRole('application', {
        name: /Foto de la historia/,
      });
      const picture = screen.getByTestId('story-photo');
      canvas.focus();

      fireEvent.keyDown(canvas, { key: 'ArrowRight', shiftKey: true });
      fireEvent.keyDown(canvas, { key: '+' });
      expect(picture.style.transform).toBe(
        'translate(10%, 0%) rotate(0deg) scale(1.1)',
      );
      fireEvent.keyDown(canvas, { key: ']' });
      expect(picture.style.filter).toBe(
        'brightness(110%) contrast(125%) saturate(125%)',
      );
      expect(screen.getByTestId('story-filter-name')).toHaveTextContent(
        'Clarendon',
      );
      expect(screen.getByRole('status')).toHaveTextContent('Filtro: Clarendon');

      // The filter is a step, and the moves before it are one more.
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
      expect(picture.style.filter).toBe('');
      expect(picture.style.transform).toContain('scale(1.1)');
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
      expect(picture.style.transform).toBe('');
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled();
    });

    it('opens a text with a tap on the photo, but not when the touch moved the photo', () => {
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });
      renderComposer({ initialMedia: photo, bgStyle: '' });
      const canvas = screen.getByTestId('story-canvas');
      const at = { clientX: 100, clientY: 100, pointerId: 1, isPrimary: true };

      fireEvent.pointerDown(canvas, at);
      fireEvent(
        window,
        Object.assign(new Event('pointermove'), {
          ...at,
          clientX: 108,
        }),
      );
      fireEvent(
        window,
        Object.assign(new Event('pointerup'), { ...at, clientX: 108 }),
      );
      fireEvent.click(canvas, { ...at, clientX: 108 });
      expect(screen.queryByTestId('story-text-mode')).not.toBeInTheDocument();
      expect(screen.getByTestId('story-photo').style.transform).not.toBe('');

      fireEvent.pointerDown(canvas, at);
      fireEvent(window, Object.assign(new Event('pointerup'), at));
      fireEvent.click(canvas, at);
      expect(screen.getByTestId('story-text-mode')).toBeInTheDocument();
    });

    it('gives a video background no keys, no transform and no filter', () => {
      const clip = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
      renderComposer({ initialMedia: clip, bgStyle: '' });
      const canvas = screen.getByTestId('story-canvas');

      expect(canvas).not.toHaveAttribute('tabindex');
      expect(screen.queryByRole('application')).not.toBeInTheDocument();
      fireEvent.keyDown(canvas, { key: ']' });
      expect(document.querySelector('video')?.getAttribute('style')).toBeNull();
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
      fireEvent.click(screen.getByRole('button', { name: 'Rojo' }));

      expect(width).toHaveValue('12');
      expect(screen.getByRole('button', { name: 'Rojo' })).toHaveAttribute(
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
      // Styles and colours take turns with the fonts above the keyboard.
      fireEvent.click(
        screen.getByRole('button', { name: 'Estilos del texto' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Neón' }));
      fireEvent.click(screen.getByRole('button', { name: 'Colores' }));
      expect(
        screen.queryByRole('button', { name: 'Neón' }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Color de texto: Negro' }),
      );
      // One button turns the alignment: centred, then left.
      fireEvent.click(
        screen.getByRole('button', { name: 'Alinear a la izquierda' }),
      );
      expect(
        screen.getByRole('button', { name: 'Alinear a la derecha' }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0]).toMatchObject({
        content: 'Hola',
        textStyle: 'neon',
        align: 'left',
      });
      expect(lastElements()[0].color).toBe('#000000');
    });

    it('offers the fonts above the keyboard from the start', async () => {
      const { lastElements } = renderComposer();

      fireEvent.click(tool('Texto'));
      typeStoryText('Hola');
      fireEvent.click(screen.getByRole('button', { name: 'Playfair' }));
      expect(screen.getByRole('button', { name: 'Playfair' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Listo' }));

      await waitFor(() => expect(lastElements()).toHaveLength(1));
      expect(lastElements()[0].fontFamily).toBe('Playfair Display');
    });

    it('has the size at the left, and gradient, spacing and width under the type options', async () => {
      const { lastElements } = renderComposer();

      fireEvent.click(tool('Texto'));
      typeStoryText('Hola');
      // The size is always at hand, at the left; the rest under "Opciones de tipo".
      fireEvent.change(screen.getByRole('slider', { name: 'Tamaño' }), {
        target: { value: '40' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Opciones de tipo' }));

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
