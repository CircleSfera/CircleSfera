import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import { type StoryCanvasRef } from './Editor/StoryCanvas';
import {
  buildPollElement,
  buildQnaElement,
  buildStickerElement,
} from './storyComposer.append';
import {
  DEFAULT_BRUSH_WIDTH,
  STORY_STICKER_MAX,
  type StoryTemplate,
} from './storyComposer.constants';
import {
  exportStoryCanvas,
  reportStoryExportError,
  type StoryCanvasSize,
} from './storyComposer.export';
import {
  getStoryCardSizeClass,
  getStoryStageFitClass,
  getStoryStagePadClass,
} from './storyComposer.layout';
import type { PanelTab, StoryComposerTab } from './storyComposer.types';
import { canDuplicateElement, isLiveElement } from './storyInteractive';
import type { StoryAudience, StoryShareOptions } from './storyShare.types';
import { useStoryBackground } from './useStoryBackground';
import { useStoryElements } from './useStoryElements';
import { useStoryTextTakeover } from './useStoryTextTakeover';

export function useStoryComposerState(props: {
  initialMedia?: File | null;
  onPost: (
    blob: Blob,
    canvas: StoryCanvasSize,
    audience?: StoryAudience,
    /** The video under the picture, which then holds only what is painted. */
    video?: File | null,
  ) => void;
  onClose: () => void;
  elements?: StoryElement[];
  bgStyle?: string;
  onElementsChange?: (elements: StoryElement[]) => void;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
  /** Sharing from the editor; its place is the location sticker's. */
  share?: StoryShareOptions;
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
  const defaultPollOptions = () => [
    t('createPost.storyComposer.poll_yes'),
    t('createPost.storyComposer.poll_no'),
  ];
  const [pollOptions, setPollOptions] = useState<string[]>(defaultPollOptions);
  const [qnaPrompt, setQnaPrompt] = useState('');
  const [showVGuide, setShowVGuide] = useState(false);
  const [showHGuide, setShowHGuide] = useState(false);
  const [draggingLayer, setDraggingLayer] = useState(false);
  const [chromePointerArmed, setChromePointerArmed] = useState(true);
  const chromeArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeStickerCategory, setActiveStickerCategory] = useState(0);
  const [brushColor, setBrushColor] = useState('#FFFFFF');
  const [brushWidth, setBrushWidth] = useState(DEFAULT_BRUSH_WIDTH);
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
    changeElements,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    commitElements,
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
    changeElements,
    selectedElementId,
    setSelectedElementId,
    setActiveTab,
    disarmChromeBriefly,
    updateElement,
  });

  // The location sticker is the place of the story: it shows the place's
  // name, and goes when the place is taken off.
  const sharing = Boolean(props.share);
  const placeName = props.share?.placeStickerName ?? null;
  useEffect(() => {
    if (!sharing) return;
    changeElements((current) => {
      if (!current.some((el) => el.type === 'location')) return current;
      if (!placeName) return current.filter((el) => el.type !== 'location');
      const content = JSON.stringify({ name: placeName });
      if (
        current.every((el) => el.type !== 'location' || el.content === content)
      ) {
        return current;
      }
      return current.map((el) =>
        el.type === 'location' ? { ...el, content } : el,
      );
    });
  }, [sharing, placeName, changeElements]);

  const removeElement = (id: string) => {
    const wasSelected = selectedElementId === id;
    removeElementBase(id);
    if (wasSelected) setTextInput('');
  };

  /** A story holds as many stickers as the server takes, and no more. */
  const liveCount = elements.filter(isLiveElement).length;
  const roomFor = (el: StoryElement | undefined) => {
    if (!el || !isLiveElement(el) || liveCount < STORY_STICKER_MAX) return true;
    toast.error(
      t('createPost.storyComposer.stickers_limit', { max: STORY_STICKER_MAX }),
    );
    return false;
  };

  const appendElement = (newElement: StoryElement) => {
    if (!roomFor(newElement)) return;
    // A story carries one link.
    if (
      newElement.type === 'link' &&
      elements.some((el) => el.type === 'link')
    ) {
      toast.error(t('createPost.storyComposer.link_one_per_story'));
      return;
    }
    changeElements((current) => [...current, newElement]);
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
    // A tool opens its own panel: the piece that was selected lets go.
    if (tab !== 'none') setSelectedElementId(null);
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
      options: pollOptions,
      defaultOptions: [
        t('createPost.storyComposer.poll_yes'),
        t('createPost.storyComposer.poll_no'),
      ],
    });
    if (!el) return;
    appendElement(el);
    setPanelTab('style');
    setPollQuestion('');
    setPollOptions(defaultPollOptions());
    setActiveTab('none');
  };

  /** Adds a piece built by a setup panel (quiz, slider, hashtag). */
  const addElement = (el: StoryElement) => {
    appendElement(el);
    setPanelTab('style');
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
    changeElements(() => newElements);
    setActiveTab('none');
  };

  // A video stays a video: the editor exports only what is painted over it.
  const backgroundVideo = bg.background?.type.startsWith('video/')
    ? bg.background
    : null;

  /** Exports the story; with an audience, it is shared to it right away. */
  const handlePost = async (audience?: StoryAudience) => {
    if (!containerRef.current) return;
    setIsExporting(true);
    setSelectedElementId(null);
    try {
      await exportStoryCanvas({
        container: containerRef.current,
        backgroundUrl: bg.backgroundUrl,
        bgStyle: bg.bgStyle,
        elementCount: elements.length,
        layerOnly: backgroundVideo !== null,
        onPost: (blob, canvas) =>
          onPost(blob, canvas, audience, backgroundVideo),
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
  const stagePadClass = getStoryStagePadClass({ textTakeoverActive });
  // The canvas fills the free height while a panel or text mode needs room.
  const stageFill = panelOpen || textTakeoverActive;
  const cardSizeClass = getStoryCardSizeClass(stageFill);
  const stageFitClass = getStoryStageFitClass(stageFill);
  const canPost = Boolean(bg.background || bg.bgStyle) && chromePointerArmed;

  return {
    onClose,
    background: bg.background,
    backgroundUrl: bg.backgroundUrl,
    backgroundIsVideo: backgroundVideo !== null,
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
    pollOptions,
    setPollOptions,
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
    commitElements,
    addSticker,
    addPoll,
    addElement,
    addQna,
    applyTemplate,
    handleUploadBackground: bg.handleUploadBackground,
    handleSelectGradient: bg.handleSelectGradient,
    handleFileChange: bg.handleFileChange,
    duplicateElement: (id: string) => {
      const el = elements.find((e) => e.id === id);
      if (el && !canDuplicateElement(el)) return;
      if (roomFor(el)) duplicateElement(id);
    },
    liveCount,
    moveElementLayer,
    removeElement,
    selectedElement,
    textTakeoverActive,
    panelOpen,
    editingElement,
    stagePadClass,
    cardSizeClass,
    stageFitClass,
    canUndo,
    canRedo,
    canPost,
  };
}
