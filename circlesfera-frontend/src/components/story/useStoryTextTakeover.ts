import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { StoryElement } from '../../types';
import type { StoryComposerTab } from './storyComposer.types';
import { getTextStyleCSS } from './storyTextStyles';

export function useStoryTextTakeover(deps: {
  /** Changes the elements; the result is one undo step. */
  changeElements: (
    change: (elements: StoryElement[]) => StoryElement[],
  ) => void;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  setActiveTab: (tab: StoryComposerTab) => void;
  disarmChromeBriefly: () => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
}) {
  const {
    changeElements,
    selectedElementId,
    setSelectedElementId,
    setActiveTab,
    disarmChromeBriefly,
    updateElement,
  } = deps;

  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textStyle, setTextStyle] =
    useState<StoryElement['textStyle']>('classic');
  const [textFont, setTextFont] = useState('Outfit');
  const [textFontSize, setTextFontSize] = useState(24);
  const [textLetterSpacing, setTextLetterSpacing] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>(
    'center',
  );
  const [textGradientColors, setTextGradientColors] = useState<
    [string, string] | undefined
  >(undefined);
  const [textTakeover, setTextTakeover] = useState<'create' | 'edit' | null>(
    null,
  );
  const [textSnapshot, setTextSnapshot] = useState<{
    content: string;
    color?: string;
    textStyle?: StoryElement['textStyle'];
    align?: StoryElement['align'];
    fontFamily?: string;
    fontSize?: number;
    letterSpacing?: number;
    width?: number;
    gradientColors?: [string, string];
  } | null>(null);
  const textEditorRef = useRef<HTMLDivElement>(null);

  /**
   * Puts the text in the editor and the caret at its end, focused. A phone
   * opens its keyboard only for a focus made within the tap itself.
   */
  const seededTakeoverKeyRef = useRef<string | null>(null);
  const focusEditor = (key: string, content: string) => {
    const el = textEditorRef.current;
    if (!el || seededTakeoverKeyRef.current === key) return;
    seededTakeoverKeyRef.current = key;
    el.textContent = content;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // The editor is normally focused within the tap (below); this covers any
  // way into text mode that does not go through it.
  useEffect(() => {
    if (!textTakeover) {
      seededTakeoverKeyRef.current = null;
      return;
    }
    focusEditor(`${textTakeover}:${selectedElementId ?? 'new'}`, textInput);
  });

  const addText = () => {
    if (!textInput.trim()) return;
    const newElement: StoryElement = {
      id: crypto.randomUUID(),
      type: 'text',
      content: textInput.trim(),
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      color: textColor,
      textStyle,
      fontFamily: textFont,
      fontSize: textFontSize,
      letterSpacing: textLetterSpacing,
      width: textWidth || undefined,
      align: textAlign,
      opacity: 1,
      gradientColors: textGradientColors,
    };
    changeElements((current) => [...current, newElement]);
    setTextInput('');
    setSelectedElementId(null);
    setTextTakeover(null);
    setActiveTab('none');
    disarmChromeBriefly();
  };

  const openTextCreate = () => {
    // The editor is on the screen when this returns, so it is focused within
    // the tap that opened it.
    flushSync(() => startTextCreate());
    focusEditor('create:new', '');
  };

  const startTextCreate = () => {
    setSelectedElementId(null);
    setTextInput('');
    setTextColor('#FFFFFF');
    setTextStyle('classic');
    setTextFont('Outfit');
    setTextFontSize(24);
    setTextLetterSpacing(0);
    setTextWidth(0);
    setTextAlign('center');
    setTextGradientColors(undefined);
    setTextSnapshot(null);
    setTextTakeover('create');
    setActiveTab('text');
  };

  const openTextEdit = (el: StoryElement) => {
    flushSync(() => startTextEdit(el));
    focusEditor(`edit:${el.id}`, el.content);
  };

  const startTextEdit = (el: StoryElement) => {
    setSelectedElementId(el.id);
    setTextInput(el.content);
    setTextColor(el.color || '#FFFFFF');
    setTextStyle(el.textStyle || 'classic');
    setTextFont(el.fontFamily || 'Outfit');
    setTextFontSize(el.fontSize || 24);
    setTextLetterSpacing(el.letterSpacing || 0);
    setTextWidth(el.width || 0);
    setTextAlign(el.align || 'center');
    setTextGradientColors(el.gradientColors);
    setTextSnapshot({
      content: el.content,
      color: el.color,
      textStyle: el.textStyle,
      align: el.align,
      fontFamily: el.fontFamily,
      fontSize: el.fontSize,
      letterSpacing: el.letterSpacing,
      width: el.width,
      gradientColors: el.gradientColors,
    });
    setTextTakeover('edit');
    setActiveTab('none');
  };

  const exitTextTakeover = (commit: boolean) => {
    if (textTakeover === 'create') {
      if (commit && textInput.trim()) {
        addText();
        return;
      }
      setTextInput('');
      setTextTakeover(null);
      setActiveTab('none');
      disarmChromeBriefly();
      return;
    }
    if (textTakeover === 'edit' && selectedElementId) {
      if (!commit && textSnapshot) {
        updateElement(selectedElementId, {
          content: textSnapshot.content,
          color: textSnapshot.color,
          textStyle: textSnapshot.textStyle,
          align: textSnapshot.align,
          fontFamily: textSnapshot.fontFamily,
          fontSize: textSnapshot.fontSize,
          letterSpacing: textSnapshot.letterSpacing,
          width: textSnapshot.width,
          gradientColors: textSnapshot.gradientColors,
        });
      } else if (commit) {
        const trimmed = textInput.trim();
        const id = selectedElementId;
        changeElements((current) =>
          !trimmed
            ? current.filter((e) => e.id !== id)
            : current.map((e) =>
                e.id === id ? { ...e, content: trimmed } : e,
              ),
        );
      }
    }
    setSelectedElementId(null);
    setTextInput('');
    setTextSnapshot(null);
    setTextTakeover(null);
    setActiveTab('none');
    disarmChromeBriefly();
  };

  const takeoverPreviewElement: StoryElement = {
    id: 'takeover-preview',
    type: 'text',
    content: textInput || ' ',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    color: textColor,
    textStyle,
    fontFamily: textFont,
    fontSize: textFontSize,
    letterSpacing: textLetterSpacing,
    width: textWidth || undefined,
    align: textAlign,
    gradientColors: textGradientColors,
    opacity: 1,
  };
  const takeoverPreviewCss = getTextStyleCSS(takeoverPreviewElement);

  return {
    textInput,
    setTextInput,
    textColor,
    setTextColor,
    textStyle,
    setTextStyle,
    textFont,
    setTextFont,
    textFontSize,
    setTextFontSize,
    textLetterSpacing,
    setTextLetterSpacing,
    textWidth,
    setTextWidth,
    textAlign,
    setTextAlign,
    textGradientColors,
    setTextGradientColors,
    textTakeover,
    setTextTakeover,
    setTextSnapshot,
    textEditorRef,
    openTextCreate,
    openTextEdit,
    exitTextTakeover,
    takeoverPreviewCss,
  };
}
