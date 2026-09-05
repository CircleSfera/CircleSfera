import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { StoryElement } from '../../types';
import type { StoryComposerTab } from './storyComposer.types';
import { getTextStyleCSS } from './storyTextStyles';

export function useStoryTextTakeover(deps: {
  pushHistory: (newElements: StoryElement[]) => void;
  setInternalElements: Dispatch<SetStateAction<StoryElement[]>>;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  setActiveTab: (tab: StoryComposerTab) => void;
  disarmChromeBriefly: () => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
}) {
  const {
    pushHistory,
    setInternalElements,
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

  // Focus + seed content when entering text takeover (not on every keystroke).
  const seededTakeoverKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!textTakeover) {
      seededTakeoverKeyRef.current = null;
      return;
    }
    const key = `${textTakeover}:${selectedElementId ?? 'new'}`;
    if (seededTakeoverKeyRef.current === key) return;
    seededTakeoverKeyRef.current = key;
    const el = textEditorRef.current;
    if (!el) return;
    el.textContent = textInput;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, [textTakeover, selectedElementId, textInput]);

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
    setInternalElements((prev) => {
      const next = [...prev, newElement];
      pushHistory(next);
      return next;
    });
    setTextInput('');
    setSelectedElementId(null);
    setTextTakeover(null);
    setActiveTab('none');
    disarmChromeBriefly();
  };

  const openTextCreate = () => {
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
        setInternalElements((prev) => {
          const next = !trimmed
            ? prev.filter((e) => e.id !== id)
            : prev.map((e) => (e.id === id ? { ...e, content: trimmed } : e));
          pushHistory(next);
          return next;
        });
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
