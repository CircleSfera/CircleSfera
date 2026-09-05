import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { type StoryCanvasRef } from './Editor/StoryCanvas';
import {
  buildPollElement,
  buildQnaElement,
  buildStickerElement,
} from './storyComposer.append';
import type { StoryTemplate } from './storyComposer.constants';
import {
  exportStoryCanvas,
  reportStoryExportError,
} from './storyComposer.export';
import {
  getStoryCardSizeClass,
  getStoryStagePadClass,
} from './storyComposer.layout';
import type { PanelTab, StoryComposerTab } from './storyComposer.types';
import { useStoryBackground } from './useStoryBackground';
import { useStoryElements } from './useStoryElements';
import { useStoryTextTakeover } from './useStoryTextTakeover';

export function useStoryComposerState(props: {
  initialMedia?: File | null;
  onPost: (blob: Blob) => void;
  onClose: () => void;
  elements?: StoryElement[];
  bgStyle?: string;
  onElementsChange?: (elements: StoryElement[]) => void;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
}) {
  const { t } = useTranslation();
  const {
    initialMedia,
    onClose,
    onPost,
    elements: initialElements = [],
    bgStyle: initialBgStyle,
    onElementsChange,
    onBgStyleChange,
    onBackgroundChange,
  } = props;

  const [activeTab, setActiveTab] = useState<StoryComposerTab>('none');
  const [panelTab, setPanelTab] = useState<PanelTab>('style');
  const [isExporting, setIsExporting] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOption1, setPollOption1] = useState(() =>
    t('createPost.storyComposer.poll_yes'),
  );
  const [pollOption2, setPollOption2] = useState(() =>
    t('createPost.storyComposer.poll_no'),
  );
  const [qnaPrompt, setQnaPrompt] = useState('');
  const [showVGuide, setShowVGuide] = useState(false);
  const [showHGuide, setShowHGuide] = useState(false);
  const [draggingLayer, setDraggingLayer] = useState(false);
  const [chromePointerArmed, setChromePointerArmed] = useState(true);
  const chromeArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeStickerCategory, setActiveStickerCategory] = useState(0);
  const [brushColor, setBrushColor] = useState('#FFFFFF');
  const [brushWidth, setBrushWidth] = useState(5);
  const storyCanvasRef = useRef<StoryCanvasRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const bg = useStoryBackground({
    initialMedia,
    initialBgStyle,
    onBgStyleChange,
    onBackgroundChange,
  });

  const {
    elements,
    setInternalElements,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    removeElement: removeElementBase,
    duplicateElement,
    moveElementLayer,
  } = useStoryElements({ initialElements, onElementsChange });

  const disarmChromeBriefly = () => {
    setChromePointerArmed(false);
    if (chromeArmTimerRef.current) clearTimeout(chromeArmTimerRef.current);
    chromeArmTimerRef.current = setTimeout(() => {
      setChromePointerArmed(true);
      chromeArmTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (chromeArmTimerRef.current) clearTimeout(chromeArmTimerRef.current);
    };
  }, []);

  const {
    setTextTakeover,
    setTextSnapshot,
    openTextCreate,
    setTextInput,
    textTakeover,
    ...textPublic
  } = useStoryTextTakeover({
    pushHistory,
    setInternalElements,
    selectedElementId,
    setSelectedElementId,
    setActiveTab,
    disarmChromeBriefly,
    updateElement,
  });

  const removeElement = (id: string) => {
    const wasSelected = selectedElementId === id;
    removeElementBase(id);
    if (wasSelected) setTextInput('');
  };

  const appendElement = (newElement: StoryElement) => {
    setInternalElements((prev) => {
      const next = [...prev, newElement];
      pushHistory(next);
      return next;
    });
    setSelectedElementId(newElement.id);
  };

  const handleSelectTab = (tab: StoryComposerTab) => {
    if (tab === 'text') {
      openTextCreate();
      return;
    }
    if (textTakeover) {
      setTextInput('');
      setTextSnapshot(null);
      setTextTakeover(null);
      setSelectedElementId(null);
    }
    setActiveTab(tab === activeTab ? 'none' : tab);
  };

  const addSticker = (sticker: string) => {
    appendElement(buildStickerElement(sticker));
    setTextInput('');
    setActiveTab('none');
  };

  const addPoll = () => {
    const el = buildPollElement({
      question: pollQuestion,
      option1: pollOption1,
      option2: pollOption2,
    });
    if (!el) return;
    appendElement(el);
    setPanelTab('style');
    setPollQuestion('');
    setPollOption1(t('createPost.storyComposer.poll_yes'));
    setPollOption2(t('createPost.storyComposer.poll_no'));
    setActiveTab('none');
  };

  const addQna = () => {
    const el = buildQnaElement(qnaPrompt);
    if (!el) return;
    appendElement(el);
    setPanelTab('style');
    setQnaPrompt('');
    setActiveTab('none');
  };

  const applyTemplate = (template: StoryTemplate) => {
    bg.setBgStyle(template.bg);
    bg.clearMediaBackground();
    const newElements: StoryElement[] = template.elements.map((el) => ({
      ...el,
      id: crypto.randomUUID(),
    }));
    setInternalElements(newElements);
    pushHistory(newElements);
    setActiveTab('none');
  };

  const handlePost = async () => {
    if (!containerRef.current) return;
    setIsExporting(true);
    setSelectedElementId(null);
    try {
      await exportStoryCanvas({
        container: containerRef.current,
        backgroundUrl: bg.backgroundUrl,
        bgStyle: bg.bgStyle,
        elementCount: elements.length,
        onPost,
      });
    } catch (err: unknown) {
      reportStoryExportError(err);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedElement = elements.find((e) => e.id === selectedElementId);
  const textTakeoverActive = textTakeover !== null;
  const panelOpen =
    !textTakeoverActive &&
    ((Boolean(selectedElementId) && selectedElement?.type !== 'text') ||
      (activeTab !== 'none' && activeTab !== 'text'));
  const editingElement =
    Boolean(selectedElementId) &&
    !textTakeoverActive &&
    selectedElement?.type !== 'text';
  const stagePadClass = getStoryStagePadClass({
    textTakeoverActive,
    editingElement: Boolean(editingElement),
    panelOpen,
  });
  const cardSizeClass = getStoryCardSizeClass({
    textTakeoverActive,
    editingElement: Boolean(editingElement),
    panelOpen,
  });
  const canPost = Boolean(bg.background || bg.bgStyle) && chromePointerArmed;

  return {
    onClose,
    background: bg.background,
    backgroundUrl: bg.backgroundUrl,
    bgStyle: bg.bgStyle,
    bgBlur: bg.bgBlur,
    setBgBlur: bg.setBgBlur,
    bgDarken: bg.bgDarken,
    setBgDarken: bg.setBgDarken,
    elements,
    activeTab,
    setActiveTab,
    panelTab,
    setPanelTab,
    isExporting,
    setTextInput,
    textTakeover,
    ...textPublic,
    pollQuestion,
    setPollQuestion,
    pollOption1,
    setPollOption1,
    pollOption2,
    setPollOption2,
    qnaPrompt,
    setQnaPrompt,
    selectedElementId,
    setSelectedElementId,
    showVGuide,
    setShowVGuide,
    showHGuide,
    setShowHGuide,
    draggingLayer,
    setDraggingLayer,
    chromePointerArmed,
    activeStickerCategory,
    setActiveStickerCategory,
    brushColor,
    setBrushColor,
    brushWidth,
    setBrushWidth,
    storyCanvasRef,
    containerRef,
    fileInputRef: bg.fileInputRef,
    undo,
    redo,
    handlePost,
    handleSelectTab,
    updateElement,
    addSticker,
    addPoll,
    addQna,
    applyTemplate,
    handleUploadBackground: bg.handleUploadBackground,
    handleSelectGradient: bg.handleSelectGradient,
    handleFileChange: bg.handleFileChange,
    duplicateElement,
    moveElementLayer,
    removeElement,
    selectedElement,
    textTakeoverActive,
    panelOpen,
    editingElement,
    stagePadClass,
    cardSizeClass,
    canUndo,
    canRedo,
    canPost,
  };
}
