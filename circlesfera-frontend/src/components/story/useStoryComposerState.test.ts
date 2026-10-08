import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { StoryElement } from '../../types';
import { GRADIENTS, TEMPLATES } from './storyComposer.constants';
import { exportStoryCanvas } from './storyComposer.export';
import { parsePollPayload, parseQnaPayload } from './storyInteractive';
import { useStoryComposerState } from './useStoryComposerState';

vi.mock('./storyComposer.export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storyComposer.export')>()),
  exportStoryCanvas: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const textElement = (over: Partial<StoryElement> = {}): StoryElement => ({
  id: 'text-1',
  type: 'text',
  content: 'Hola',
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  color: '#FF0000',
  textStyle: 'neon',
  align: 'left',
  ...over,
});

function setup(
  props: Partial<Parameters<typeof useStoryComposerState>[0]> = {},
) {
  const onPost = vi.fn();
  const onClose = vi.fn();
  const hook = renderHook(() =>
    useStoryComposerState({ onPost, onClose, ...props }),
  );
  return { ...hook, onPost, onClose };
}

describe('useStoryComposerState', () => {
  beforeEach(() => {
    vi.mocked(exportStoryCanvas).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage('en');
  });

  describe('opening', () => {
    it('starts a text story on the first gradient, ready to share, with no panel open', () => {
      const { result } = setup();

      expect(result.current.bgStyle).toBe(GRADIENTS[0]);
      expect(result.current.elements).toEqual([]);
      expect(result.current.activeTab).toBe('none');
      expect(result.current.panelOpen).toBe(false);
      expect(result.current.canPost).toBe(true);
    });

    it('tells the owner which gradient a story opened without one starts on', () => {
      const onBgStyleChange = vi.fn();
      setup({ bgStyle: '', onBgStyleChange });

      expect(onBgStyleChange).toHaveBeenCalledWith(GRADIENTS[0]);
    });

    it('opens on the given photo, with no gradient behind it', () => {
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });
      const { result } = setup({ initialMedia: photo, bgStyle: '' });

      expect(result.current.background).toBe(photo);
      expect(result.current.backgroundUrl).toEqual(expect.any(String));
      expect(result.current.bgStyle).toBe('');
      expect(result.current.canPost).toBe(true);
    });
  });

  describe('tools', () => {
    it('opens a tool panel and closes it when the same tool is chosen again', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('stickers'));
      expect(result.current.activeTab).toBe('stickers');
      expect(result.current.panelOpen).toBe(true);

      act(() => result.current.handleSelectTab('stickers'));
      expect(result.current.activeTab).toBe('none');
      expect(result.current.panelOpen).toBe(false);
    });

    it('switches from one tool panel to another', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('stickers'));
      act(() => result.current.handleSelectTab('background'));

      expect(result.current.activeTab).toBe('background');
    });

    it('leaves text mode without adding text when another tool is chosen', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('text'));
      act(() => result.current.setTextInput('a medias'));
      act(() => result.current.handleSelectTab('draw'));

      expect(result.current.textTakeoverActive).toBe(false);
      expect(result.current.activeTab).toBe('draw');
      expect(result.current.elements).toEqual([]);
      expect(result.current.textInput).toBe('');
    });
  });

  describe('stickers, polls and question boxes', () => {
    it('adds a sticker, selects it, closes the panel and can undo it', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('stickers'));
      act(() => result.current.addSticker('🔥'));

      expect(result.current.elements).toHaveLength(1);
      expect(result.current.elements[0]).toMatchObject({
        type: 'sticker',
        content: '🔥',
      });
      expect(result.current.selectedElementId).toBe(
        result.current.elements[0].id,
      );
      expect(result.current.activeTab).toBe('none');
      // A selected sticker keeps its edit panel open.
      expect(result.current.panelOpen).toBe(true);
      expect(result.current.editingElement).toBe(true);

      act(() => result.current.undo());
      expect(result.current.elements).toEqual([]);
    });

    it('offers the two default answers of a poll in the app language', async () => {
      await act(() => i18n.changeLanguage('es'));
      const { result } = setup();

      expect(result.current.pollOption1).toBe('Sí');
      expect(result.current.pollOption2).toBe('No');
    });

    it('adds a poll with its question and answers, then empties the form', async () => {
      await act(() => i18n.changeLanguage('es'));
      const { result } = setup();

      act(() => result.current.setPollQuestion('¿Playa o montaña?'));
      act(() => result.current.setPollOption1('Playa'));
      act(() => result.current.setPollOption2('Montaña'));
      act(() => result.current.addPoll());

      expect(parsePollPayload(result.current.elements[0].content)).toEqual({
        question: '¿Playa o montaña?',
        options: ['Playa', 'Montaña'],
      });
      expect(result.current.pollQuestion).toBe('');
      expect(result.current.pollOption1).toBe('Sí');
      expect(result.current.pollOption2).toBe('No');
      expect(result.current.activeTab).toBe('none');
    });

    it('does not add a poll without a question', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('poll'));
      act(() => result.current.addPoll());

      expect(result.current.elements).toEqual([]);
      expect(result.current.activeTab).toBe('poll');
    });

    it('adds a question box with its prompt, then empties the form', () => {
      const { result } = setup();

      act(() => result.current.setQnaPrompt('Pregúntame'));
      act(() => result.current.addQna());

      expect(parseQnaPayload(result.current.elements[0].content)).toEqual({
        prompt: 'Pregúntame',
      });
      expect(result.current.qnaPrompt).toBe('');
    });

    it('does not add a question box without a prompt', () => {
      const { result } = setup();

      act(() => result.current.addQna());

      expect(result.current.elements).toEqual([]);
    });
  });

  describe('background', () => {
    it('replaces the photo with the chosen gradient and reports it', () => {
      const onBgStyleChange = vi.fn();
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });
      const { result } = setup({
        initialMedia: photo,
        bgStyle: '',
        onBgStyleChange,
      });

      act(() => result.current.handleSelectGradient(GRADIENTS[2]));

      expect(result.current.bgStyle).toBe(GRADIENTS[2]);
      expect(result.current.background).toBeNull();
      expect(result.current.backgroundUrl).toBeNull();
      expect(onBgStyleChange).toHaveBeenLastCalledWith(GRADIENTS[2]);
    });

    it('replaces the gradient with an uploaded photo and reports the file', () => {
      const onBackgroundChange = vi.fn();
      const { result } = setup({ onBackgroundChange });
      const photo = new File(['x'], 'photo.png', { type: 'image/png' });

      act(() =>
        result.current.handleFileChange({
          target: { files: [photo] },
        } as unknown as React.ChangeEvent<HTMLInputElement>),
      );

      expect(result.current.background).toBe(photo);
      expect(result.current.bgStyle).toBe('');
      expect(onBackgroundChange).toHaveBeenCalledWith(photo);
    });

    it('applies a template: its background and its elements, as one undo step', () => {
      const template = TEMPLATES[0];
      const { result } = setup();

      act(() => result.current.addSticker('🔥'));
      act(() => result.current.applyTemplate(template));

      expect(result.current.bgStyle).toBe(template.bg);
      expect(result.current.elements).toHaveLength(template.elements.length);
      expect(result.current.elements.map((e) => e.content)).toEqual(
        template.elements.map((e) => e.content),
      );

      act(() => result.current.undo());
      expect(result.current.elements.map((e) => e.content)).toEqual(['🔥']);
    });
  });

  describe('text mode', () => {
    it('opens empty with the default look', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('text'));

      expect(result.current.textTakeover).toBe('create');
      expect(result.current.textTakeoverActive).toBe(true);
      expect(result.current.panelOpen).toBe(false);
      expect(result.current.textInput).toBe('');
      expect(result.current.textColor).toBe('#FFFFFF');
      expect(result.current.textStyle).toBe('classic');
      expect(result.current.textAlign).toBe('center');
    });

    it('adds the written text with the chosen look when confirmed', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('text'));
      act(() => result.current.setTextInput('  Hola mundo  '));
      act(() => result.current.setTextColor('#00FF00'));
      act(() => result.current.setTextStyle('neon'));
      act(() => result.current.setTextAlign('left'));
      act(() => result.current.exitTextTakeover(true));

      expect(result.current.elements).toHaveLength(1);
      expect(result.current.elements[0]).toMatchObject({
        type: 'text',
        content: 'Hola mundo',
        color: '#00FF00',
        textStyle: 'neon',
        align: 'left',
      });
      expect(result.current.textTakeoverActive).toBe(false);
      expect(result.current.selectedElementId).toBeNull();
      expect(result.current.canUndo).toBe(true);
    });

    it('adds nothing when cancelled, or when confirmed with only spaces', () => {
      const { result } = setup();

      act(() => result.current.handleSelectTab('text'));
      act(() => result.current.setTextInput('descartado'));
      act(() => result.current.exitTextTakeover(false));
      expect(result.current.elements).toEqual([]);

      act(() => result.current.handleSelectTab('text'));
      act(() => result.current.setTextInput('   '));
      act(() => result.current.exitTextTakeover(true));
      expect(result.current.elements).toEqual([]);
      expect(result.current.textTakeoverActive).toBe(false);
    });

    it('opens an existing text with its own content and look', () => {
      const existing = textElement();
      const { result } = setup({ elements: [existing] });

      act(() => result.current.openTextEdit(existing));

      expect(result.current.textTakeover).toBe('edit');
      expect(result.current.selectedElementId).toBe('text-1');
      expect(result.current.textInput).toBe('Hola');
      expect(result.current.textColor).toBe('#FF0000');
      expect(result.current.textStyle).toBe('neon');
      expect(result.current.textAlign).toBe('left');
    });

    it('saves the edited text when confirmed, as an undo step', () => {
      const existing = textElement();
      const { result } = setup({ elements: [existing] });

      act(() => result.current.openTextEdit(existing));
      act(() => result.current.setTextInput('Adiós'));
      act(() => result.current.exitTextTakeover(true));

      expect(result.current.elements[0].content).toBe('Adiós');
      expect(result.current.selectedElementId).toBeNull();

      act(() => result.current.undo());
      expect(result.current.elements[0].content).toBe('Hola');
    });

    it('puts back the look the text had when an edit is cancelled', () => {
      const existing = textElement();
      const { result } = setup({ elements: [existing] });

      act(() => result.current.openTextEdit(existing));
      act(() =>
        result.current.updateElement('text-1', {
          color: '#0000FF',
          textStyle: 'retro',
        }),
      );
      act(() => result.current.exitTextTakeover(false));

      expect(result.current.elements[0]).toMatchObject({
        content: 'Hola',
        color: '#FF0000',
        textStyle: 'neon',
      });
    });

    it('removes a text that is confirmed empty', () => {
      const existing = textElement();
      const { result } = setup({ elements: [existing] });

      act(() => result.current.openTextEdit(existing));
      act(() => result.current.setTextInput('  '));
      act(() => result.current.exitTextTakeover(true));

      expect(result.current.elements).toEqual([]);
    });

    it('holds the share button for a moment after leaving text mode, so the same tap cannot share', () => {
      vi.useFakeTimers();
      const { result } = setup();

      act(() => result.current.handleSelectTab('text'));
      act(() => result.current.exitTextTakeover(false));
      expect(result.current.canPost).toBe(false);

      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(result.current.canPost).toBe(true);
    });
  });

  describe('removing', () => {
    it('removes the selected element and clears what was being typed', () => {
      const existing = textElement();
      const { result } = setup({ elements: [existing] });

      act(() => result.current.setSelectedElementId('text-1'));
      act(() => result.current.setTextInput('algo'));
      act(() => result.current.removeElement('text-1'));

      expect(result.current.elements).toEqual([]);
      expect(result.current.selectedElementId).toBeNull();
      expect(result.current.textInput).toBe('');
    });
  });

  describe('sharing', () => {
    function withCanvas(result: ReturnType<typeof setup>['result']) {
      const node = document.createElement('div');
      (
        result.current.containerRef as { current: HTMLDivElement | null }
      ).current = node;
      return node;
    }

    it('does nothing while the story canvas is not on screen', async () => {
      const { result } = setup();

      await act(() => result.current.handlePost());

      expect(exportStoryCanvas).not.toHaveBeenCalled();
    });

    it('exports the canvas with the current background and hands the image to the owner', async () => {
      const { result, onPost } = setup();
      const node = withCanvas(result);
      vi.mocked(exportStoryCanvas).mockResolvedValue();

      act(() => result.current.addSticker('🔥'));
      await act(() => result.current.handlePost());

      expect(exportStoryCanvas).toHaveBeenCalledWith({
        container: node,
        backgroundUrl: null,
        bgStyle: GRADIENTS[0],
        elementCount: 1,
        onPost,
      });
      // Nothing stays selected, so no selection frame ends up in the image.
      expect(result.current.selectedElementId).toBeNull();
      expect(result.current.isExporting).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('tells the user when the image could not be made and lets them try again', async () => {
      const { result } = setup();
      withCanvas(result);
      vi.mocked(exportStoryCanvas).mockRejectedValue(new Error('canvas'));

      await act(() => result.current.handlePost());

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(result.current.isExporting).toBe(false);
      expect(result.current.canPost).toBe(true);
    });
  });
});
