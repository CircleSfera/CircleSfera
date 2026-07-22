import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import { toBlob } from 'html-to-image';
import {
  ALargeSmall,
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Image as ImageIcon,
  Layers,
  LetterText,
  Loader2,
  Move,
  Palette,
  Plus,
  RotateCw as RedoIcon,
  RotateCcw,
  RotateCw,
  Send,
  Smile,
  Sparkles,
  SunDim,
  Trash2,
  Type,
  WrapText,
  X,
  ZoomIn,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { StoryElement } from '../../types';
import { logger } from '../../utils/logger';
import ColorPicker from './ColorPicker';

// ─── Font Library ───
const FONTS = [
  { name: 'Outfit', label: 'Outfit', style: 'sans-serif' },
  { name: 'Inter', label: 'Inter', style: 'sans-serif' },
  { name: 'Playfair Display', label: 'Playfair', style: 'serif' },
  { name: 'Space Grotesk', label: 'Space', style: 'sans-serif' },
  { name: 'DM Serif Display', label: 'DM Serif', style: 'serif' },
  { name: 'Bebas Neue', label: 'Bebas', style: 'sans-serif' },
  { name: 'Pacifico', label: 'Pacifico', style: 'cursive' },
  { name: 'Permanent Marker', label: 'Marker', style: 'cursive' },
  { name: 'Dancing Script', label: 'Dancing', style: 'cursive' },
  { name: 'Caveat', label: 'Caveat', style: 'cursive' },
] as const;

// ─── Text Style Config ───
const TEXT_STYLES: { id: StoryElement['textStyle']; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'box', label: 'Box' },
  { id: 'box-shadow', label: 'Shadow' },
  { id: 'neon', label: 'Neon' },
  { id: 'outline', label: 'Outline' },
  { id: 'shadow', label: 'Classic Shadow' },
  { id: 'retro', label: 'Retro' },
];

// ─── Gradient Presets for text ───
const GRADIENT_PRESETS: [string, string][] = [
  ['#ff6b6b', '#feca57'],
  ['#a29bfe', '#6c5ce7'],
  ['#fd79a8', '#e84393'],
  ['#00cec9', '#0984e3'],
  ['#55efc4', '#00b894'],
  ['#fdcb6e', '#e17055'],
];

// ─── Story Templates ───
const TEMPLATES = [
  {
    name: 'Quote',
    bg: 'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b69 100%)',
    elements: [
      {
        type: 'text' as const,
        content: '"Your quote here"',
        fontSize: 32,
        fontFamily: 'Playfair Display',
        textStyle: 'classic' as const,
        color: '#FFFFFF',
        x: 0,
        y: -20,
        scale: 1,
        rotation: 0,
        width: 280,
        align: 'center' as const,
        opacity: 1,
      },
      {
        type: 'text' as const,
        content: '— Author',
        fontSize: 16,
        fontFamily: 'Inter',
        textStyle: 'classic' as const,
        color: '#FFFFFF80',
        x: 0,
        y: 60,
        scale: 1,
        rotation: 0,
        width: 280,
        align: 'center' as const,
        opacity: 0.6,
      },
    ],
  },
  {
    name: 'Announce',
    bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    elements: [
      {
        type: 'sticker' as const,
        content: '🎉',
        x: 0,
        y: -80,
        scale: 2,
        rotation: 0,
        opacity: 1,
      },
      {
        type: 'text' as const,
        content: 'ANNOUNCEMENT',
        fontSize: 28,
        fontFamily: 'Bebas Neue',
        textStyle: 'box' as const,
        color: '#FFFFFF',
        x: 0,
        y: 20,
        scale: 1,
        rotation: 0,
        width: 300,
        align: 'center' as const,
        opacity: 1,
      },
      {
        type: 'text' as const,
        content: 'Tap to add details...',
        fontSize: 16,
        fontFamily: 'Inter',
        textStyle: 'classic' as const,
        color: '#FFFFFFAA',
        x: 0,
        y: 80,
        scale: 1,
        rotation: 0,
        width: 260,
        align: 'center' as const,
        opacity: 0.7,
      },
    ],
  },
  {
    name: 'Minimal',
    bg: '#000000',
    elements: [
      {
        type: 'text' as const,
        content: 'Your text',
        fontSize: 48,
        fontFamily: 'Outfit',
        textStyle: 'classic' as const,
        color: '#FFFFFF',
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 300,
        align: 'center' as const,
        opacity: 1,
      },
    ],
  },
  {
    name: 'Gradient',
    bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    elements: [
      {
        type: 'text' as const,
        content: 'HELLO',
        fontSize: 64,
        fontFamily: 'Bebas Neue',
        textStyle: 'classic' as const,
        color: '#FFFFFF',
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 300,
        align: 'center' as const,
        opacity: 1,
      },
    ],
  },
  {
    name: 'Neon',
    bg: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    elements: [
      {
        type: 'text' as const,
        content: 'GLOW',
        fontSize: 56,
        fontFamily: 'Permanent Marker',
        textStyle: 'neon' as const,
        color: '#00ff88',
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 300,
        align: 'center' as const,
        opacity: 1,
      },
    ],
  },
];

interface StoryComposerProps {
  initialMedia?: File | null;
  onPost: (blob: Blob) => void;
  onClose: () => void;
  elements?: StoryElement[];
  bgStyle?: string;
  onElementsChange?: (elements: StoryElement[]) => void;
  onBgStyleChange?: (style: string) => void;
  onBackgroundChange?: (file: File) => void;
}

// ─── Sticker Categories ───
const STICKER_CATEGORIES = [
  {
    label: 'Popular',
    items: [
      '🔥',
      '❤️',
      '😂',
      '😍',
      '🎉',
      '👍',
      '👏',
      '💯',
      '✨',
      '🙌',
      '💕',
      '😎',
      '🥳',
      '💪',
      '😊',
    ],
  },
  {
    label: 'Faces',
    items: [
      '😀',
      '😃',
      '😄',
      '😁',
      '🤣',
      '😅',
      '😆',
      '🥹',
      '🤪',
      '😜',
      '🤩',
      '🥰',
      '😇',
      '🤗',
      '🤭',
    ],
  },
  {
    label: 'Reactions',
    items: [
      '💀',
      '😭',
      '🫠',
      '🤯',
      '🫣',
      '🤔',
      '😤',
      '😈',
      '👀',
      '🫡',
      '👁️',
      '🫶',
      '🤌',
      '💅',
      '🙄',
    ],
  },
  {
    label: 'Objects',
    items: [
      '🎯',
      '💎',
      '🏆',
      '🎨',
      '📸',
      '🎵',
      '🌟',
      '⚡',
      '🦋',
      '🌈',
      '🍕',
      '☕',
      '🎭',
      '🔮',
      '👑',
    ],
  },
  {
    label: 'Nature',
    items: [
      '🌸',
      '🌺',
      '🌻',
      '🍀',
      '🌿',
      '☀️',
      '🌙',
      '⭐',
      '🌊',
      '🔥',
      '❄️',
      '🌴',
      '🌵',
      '🍁',
      '🌾',
    ],
  },
];

// ─── Gradient & Color Backgrounds ───
const GRADIENTS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)',
  'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b69 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(135deg, #200122 0%, #6f0000 100%)',
  '#000000',
  '#1a1a1a',
  '#FFFFFF',
  '#4158D0',
  '#C850C0',
  '#0ea5e9',
  '#10b981',
  '#f43f5e',
];

// ─── Helper: get text style CSS ───
function getTextStyleCSS(el: StoryElement): React.CSSProperties {
  const base: React.CSSProperties = {
    color: el.color,
    fontFamily:
      el.type === 'text'
        ? `"${el.fontFamily || 'Outfit'}", sans-serif`
        : 'inherit',
    fontSize: el.fontSize ? `${el.fontSize}px` : '24px',
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : 'normal',
    width: el.width ? `${el.width}px` : 'auto',
    minWidth:
      el.textStyle === 'box' || el.textStyle === 'box-shadow'
        ? 'min-content'
        : undefined,
    maxWidth: el.width ? `${el.width}px` : '90vw',
    textAlign: el.align || 'center',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.25,
    opacity: el.opacity ?? 1,
  };

  if (el.gradientColors && el.type === 'text') {
    base.background = `linear-gradient(135deg, ${el.gradientColors[0]}, ${el.gradientColors[1]})`;
    base.WebkitBackgroundClip = 'text';
    base.backgroundClip = 'text';
    base.WebkitTextFillColor = 'transparent';
    base.color = 'transparent';
  }

  switch (el.textStyle) {
    case 'neon':
      base.textShadow = `0 0 10px ${el.color}, 0 0 20px ${el.color}`;
      break;
    case 'outline':
      base.WebkitTextStroke = `1.5px ${el.color}`;
      base.WebkitTextFillColor = el.gradientColors ? undefined : 'transparent';
      if (!el.gradientColors) base.color = 'transparent';
      break;
    case 'shadow':
      base.textShadow = `4px 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(0,0,0,0.3)`;
      break;
    case 'retro':
      base.textShadow = `3px 3px 0 rgba(0,0,0,0.4), -1px -1px 0 rgba(255,255,255,0.1)`;
      break;
    default:
      if (!el.gradientColors) base.textShadow = '0 2px 4px rgba(0,0,0,0.5)';
  }
  return base;
}

// ─── Draggable Element Component ───
interface DraggableElementProps {
  el: StoryElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  onUpdate: (id: string, updates: Partial<StoryElement>) => void;
  onSelect: (id: string) => void;
  setShowVGuide: (show: boolean) => void;
  setShowHGuide: (show: boolean) => void;
  setActiveTab: (
    tab: 'none' | 'text' | 'stickers' | 'background' | 'templates',
  ) => void;
  setTextInput: (text: string) => void;
  setTextColor: (color: string) => void;
  setTextStyle: (style: StoryElement['textStyle']) => void;
}

function DraggableStoryElement({
  el,
  containerRef,
  isSelected,
  onUpdate,
  onSelect,
  setShowVGuide,
  setShowHGuide,
  setActiveTab,
  setTextInput,
  setTextColor,
  setTextStyle,
}: DraggableElementProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(el.x);
  const y = useMotionValue(el.y);

  useEffect(() => {
    x.set(el.x);
    y.set(el.y);
  }, [el.x, el.y, x, y]);

  return (
    <motion.div
      ref={elementRef}
      drag
      dragMomentum={false}
      dragElastic={0}
      transformTemplate={({ x, y, scale, rotate }) =>
        `translate(${x}, ${y}) translate(-50%, -50%) scale(${scale}) rotate(${rotate})`
      }
      onDrag={() => {
        if (!containerRef.current || !elementRef.current) return;
        const container = containerRef.current.getBoundingClientRect();
        const element = elementRef.current.getBoundingClientRect();
        const containerCenterX = container.left + container.width / 2;
        const containerCenterY = container.top + container.height / 2;
        const elementCenterX = element.left + element.width / 2;
        const elementCenterY = element.top + element.height / 2;
        const threshold = 10;
        setShowVGuide(Math.abs(elementCenterX - containerCenterX) < threshold);
        setShowHGuide(Math.abs(elementCenterY - containerCenterY) < threshold);
        if (Math.abs(elementCenterX - containerCenterX) < threshold) x.set(0);
        if (Math.abs(elementCenterY - containerCenterY) < threshold) y.set(0);
      }}
      onDragStart={() => onSelect(el.id)}
      onDragEnd={() => {
        setShowVGuide(false);
        setShowHGuide(false);
        onUpdate(el.id, { x: x.get(), y: y.get() });
      }}
      initial={{ scale: 0 }}
      animate={{
        scale: el.scale,
        rotate: el.rotation,
        borderColor: isSelected ? 'rgba(255,255,255,0.5)' : 'transparent',
      }}
      style={{
        x,
        y,
        left: '50%',
        top: '50%',
        zIndex: isSelected ? 200 : (el.zIndex ?? 100),
        position: 'absolute',
        opacity: el.opacity ?? 1,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTap={(event) => {
        if (event && 'stopPropagation' in event)
          (event as MouseEvent | TouchEvent).stopPropagation();
        onSelect(el.id);
        if (el.type === 'text') {
          setActiveTab('text');
          setTextInput(el.content);
          setTextColor(el.color || '#FFFFFF');
          setTextStyle(el.textStyle || 'box');
        }
      }}
      className={`absolute cursor-move touch-none border-2 rounded-lg p-1 transition-colors ${
        isSelected ? 'border-white/50' : 'border-transparent'
      }`}
    >
      <div
        className={`relative px-5 py-2.5 rounded-xl flex items-center justify-center select-none transition-all duration-300
          ${el.type === 'sticker' ? 'text-6xl' : ''}
          ${el.textStyle === 'box' || el.textStyle === 'box-shadow' ? 'bg-black/70 backdrop-blur-md' : ''}
          ${el.textStyle === 'box-shadow' ? 'shadow-[0_10px_30px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]' : ''}
          ${el.textStyle === 'neon' ? 'font-bold' : ''}
        `}
        style={getTextStyleCSS(el)}
      >
        {el.type === ('poll' as any) || el.content.startsWith('{"question"') ? (
          (() => {
            try {
              const poll = JSON.parse(el.content);
              return (
                <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/15 p-4 rounded-2xl shadow-2xl text-left min-w-[220px] pointer-events-none select-none">
                  <p className="text-white font-bold text-sm mb-3 tracking-tight">
                    {poll.question}
                  </p>
                  <div className="space-y-2">
                    {poll.options?.map((opt: string) => (
                      <div
                        key={`poll-opt-${opt}`}
                        className="bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-between shadow-sm"
                      >
                        <span>{opt}</span>
                        <span className="text-[10px] text-brand-primary font-bold">
                          0%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch {
              return el.content;
            }
          })()
        ) : (
          el.content
        )}
      </div>
    </motion.div>
  );
}

// ─── Bottom Panel Tab Type ───
type PanelTab = 'style' | 'transform' | 'layers';

// ─── Main StoryComposer Component ───
export default function StoryComposer({
  initialMedia,
  onClose,
  onPost,
  elements: initialElements = [],
  bgStyle: initialBgStyle = GRADIENTS[0],
  onElementsChange,
  onBgStyleChange,
  onBackgroundChange,
}: StoryComposerProps) {
  const [background, setBackground] = useState<File | null>(
    initialMedia || null,
  );
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    initialMedia ? URL.createObjectURL(initialMedia) : null,
  );
  const [bgStyle, setInternalBgStyle] = useState<string>(initialBgStyle);
  const [bgBlur, setBgBlur] = useState(0);
  const [bgDarken, setBgDarken] = useState(0);
  const [elements, setInternalElements] =
    useState<StoryElement[]>(initialElements);
  const [activeTab, setActiveTab] = useState<
    'none' | 'text' | 'stickers' | 'background' | 'templates' | 'poll'
  >('none');
  const [panelTab, setPanelTab] = useState<PanelTab>('style');
  const [isExporting, setIsExporting] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOption1, setPollOption1] = useState('Sí');
  const [pollOption2, setPollOption2] = useState('No');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textStyle, setTextStyle] = useState<StoryElement['textStyle']>('box');
  const [textFont, setTextFont] = useState('Outfit');
  const [textFontSize, setTextFontSize] = useState(24);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [showVGuide, setShowVGuide] = useState(false);
  const [showHGuide, setShowHGuide] = useState(false);
  const [activeStickerCategory, setActiveStickerCategory] = useState(0);

  // Undo/Redo State
  const [historyState, setHistoryState] = useState({
    stack: [initialElements],
    index: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editAreaRef = useRef<HTMLTextAreaElement>(null);
  const addAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialMedia) {
      setBackground(initialMedia);
      setBackgroundUrl(URL.createObjectURL(initialMedia));
    }
  }, [initialMedia]);

  useEffect(() => {
    const resize = (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    if (selectedElementId) resize(editAreaRef.current);
    else resize(addAreaRef.current);
  }, [selectedElementId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setBackground(file);
      setBackgroundUrl(URL.createObjectURL(file));
      setBgStyle('');
      onBackgroundChange?.(file);
    }
  };

  // Move parent sync to useEffect to avoid side effects in state setters
  useEffect(() => {
    onElementsChange?.(elements);
  }, [elements, onElementsChange]);

  const pushHistory = (newElements: StoryElement[]) => {
    setHistoryState((prev) => {
      const newStack = prev.stack.slice(0, prev.index + 1);
      return {
        stack: [...newStack, newElements],
        index: newStack.length,
      };
    });
  };

  const undo = () => {
    setHistoryState((prev) => {
      if (prev.index > 0) {
        const newIndex = prev.index - 1;
        setInternalElements(prev.stack[newIndex]);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  };

  const redo = () => {
    setHistoryState((prev) => {
      if (prev.index < prev.stack.length - 1) {
        const newIndex = prev.index + 1;
        setInternalElements(prev.stack[newIndex]);
        return { ...prev, index: newIndex };
      }
      return prev;
    });
  };

  const addText = () => {
    if (!textInput.trim()) return;
    if (selectedElementId) {
      setSelectedElementId(null);
      setTextInput('');
      setActiveTab('none');
      return;
    }
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
      letterSpacing: 0,
      align: 'center',
      opacity: 1,
    };
    setInternalElements((prev) => {
      const next = [...prev, newElement];
      pushHistory(next);
      return next;
    });
    setSelectedElementId(newElement.id);
    setTextInput('');
    setActiveTab('none');
  };

  const addSticker = (sticker: string) => {
    const newElement: StoryElement = {
      id: crypto.randomUUID(),
      type: 'sticker',
      content: sticker,
      x: 0,
      y: 0,
      scale: 1.2,
      rotation: 0,
      align: 'center',
      opacity: 1,
    };
    setInternalElements((prev) => {
      const next = [...prev, newElement];
      pushHistory(next);
      return next;
    });
    setSelectedElementId(newElement.id);
    setTextInput('');
    setActiveTab('none');
  };

  const addPoll = () => {
    if (!pollQuestion.trim()) return;
    const pollData = JSON.stringify({
      question: pollQuestion.trim(),
      options: [pollOption1.trim() || 'Sí', pollOption2.trim() || 'No'],
    });
    const newElement: StoryElement = {
      id: crypto.randomUUID(),
      type: 'poll' as any,
      content: pollData,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      align: 'center',
      opacity: 1,
    };
    setInternalElements((prev) => {
      const next = [...prev, newElement];
      pushHistory(next);
      return next;
    });
    setSelectedElementId(newElement.id);
    setPollQuestion('');
    setActiveTab('none');
  };

  const setBgStyle = (style: string) => {
    setInternalBgStyle(style);
    onBgStyleChange?.(style);
  };

  const updateElement = (id: string, updates: Partial<StoryElement>) => {
    setInternalElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    );
  };

  const removeElement = (id: string) => {
    setInternalElements((prev) => {
      const next = prev.filter((el) => el.id !== id);
      pushHistory(next);
      return next;
    });
    if (selectedElementId === id) {
      setSelectedElementId(null);
      setTextInput('');
    }
  };

  const duplicateElement = (id: string) => {
    setInternalElements((prev) => {
      const el = prev.find((e) => e.id === id);
      if (!el) return prev;
      const newEl: StoryElement = {
        ...el,
        id: crypto.randomUUID(),
        x: el.x + 20,
        y: el.y + 20,
      };
      const next = [...prev, newEl];
      pushHistory(next);
      setSelectedElementId(newEl.id);
      return next;
    });
  };

  const moveElementLayer = (id: string, direction: 'up' | 'down') => {
    setInternalElements((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      pushHistory(next);
      return next;
    });
  };

  const applyTemplate = (template: (typeof TEMPLATES)[0]) => {
    setBgStyle(template.bg);
    setBackground(null);
    setBackgroundUrl(null);
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
      logger.log('Starting story export...', {
        hasBackground: !!backgroundUrl,
        bgStyle: bgStyle || 'none',
        elementCount: elements.length,
      });

      const blob = await toBlob(containerRef.current, {
        quality: 0.95, // Slightly lower for better compression
        backgroundColor:
          bgStyle.includes('gradient') || bgStyle.startsWith('#')
            ? undefined
            : '#000000',
        style: { borderRadius: '0' },
      });

      if (!blob) throw new Error('Failed to generate image blob');

      logger.log(
        'Story export success, blob size:',
        (blob.size / 1024).toFixed(2),
        'KB',
      );
      await onPost(blob);
      onClose();
    } catch (err: unknown) {
      logger.error('Story export failed:', err);
      alert(
        `Failed to create story image: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const selectedElement = elements.find((e) => e.id === selectedElementId);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col font-sans">
      {/* ─── Header ─── */}
      <div className="relative flex items-center justify-between px-2 py-1 z-30 bg-linear-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-xl text-white/70 hover:text-white transition-all"
        >
          <X size={22} />
        </button>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={historyState.index <= 0}
            className="p-2.5 rounded-xl transition-all disabled:opacity-20 bg-black/20 text-white/60 hover:bg-black/40 hover:text-white"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={historyState.index >= historyState.stack.length - 1}
            className="p-2.5 rounded-xl transition-all disabled:opacity-20 bg-black/20 text-white/60 hover:bg-black/40 hover:text-white"
          >
            <RedoIcon size={18} />
          </button>

          <div className="w-px h-8 self-center bg-white/6" />

          {/* Tool buttons */}
          {(
            [
              { tab: 'background' as const, icon: ImageIcon },
              { tab: 'text' as const, icon: Type },
              { tab: 'stickers' as const, icon: Smile },
              { tab: 'poll' as const, icon: BarChart2 },
              { tab: 'templates' as const, icon: Sparkles },
            ] as const
          ).map(({ tab, icon: Icon }) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(activeTab === tab ? 'none' : tab)}
              className={`p-2.5 rounded-xl transition-all ${
                activeTab === tab
                  ? 'bg-white text-black scale-105 shadow-lg'
                  : 'bg-black/20 text-white/60 hover:bg-black/40 hover:text-white'
              }`}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>

        <motion.button
          type="button"
          onClick={handlePost}
          disabled={(!background && !bgStyle) || isExporting}
          className="bg-linear-to-r from-brand-primary to-brand-blue text-white px-5 py-2 rounded-xl font-bold text-sm
                     disabled:opacity-30 flex items-center gap-2 shadow-lg shadow-brand-primary/20 transition-all"
          whileTap={{ scale: 0.95 }}
        >
          {isExporting ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <>
              Post <Send size={14} />
            </>
          )}
        </motion.button>
      </div>

      {/* ─── Main Canvas ─── */}
      <div
        className="flex-1 relative overflow-hidden bg-zinc-950 flex items-center justify-center p-3 md:p-8"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelectedElementId(null);
        }}
      >
        <div
          ref={containerRef}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelectedElementId(null);
          }}
          className="relative aspect-9/16 h-full max-h-[85vh] bg-black overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)] rounded-[36px] border border-white/5"
          style={{
            ...(bgStyle?.startsWith('linear-gradient') ||
            bgStyle?.startsWith('radial-gradient')
              ? { backgroundImage: bgStyle }
              : { backgroundColor: bgStyle || 'black' }),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {backgroundUrl &&
            (background?.type.startsWith('video/') ? (
              <video
                src={backgroundUrl}
                crossOrigin={
                  backgroundUrl.startsWith('blob:') ||
                  backgroundUrl.startsWith('data:')
                    ? undefined
                    : 'anonymous'
                }
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                style={{
                  filter:
                    bgBlur > 0 || bgDarken > 0
                      ? `blur(${bgBlur}px) brightness(${100 - bgDarken}%)`
                      : undefined,
                }}
              />
            ) : (
              <img
                src={backgroundUrl}
                crossOrigin={
                  backgroundUrl.startsWith('blob:') ||
                  backgroundUrl.startsWith('data:')
                    ? undefined
                    : 'anonymous'
                }
                className="w-full h-full object-cover"
                alt="Background"
                onLoad={() => logger.log('Background image loaded in editor')}
                style={{
                  filter:
                    bgBlur > 0 || bgDarken > 0
                      ? `blur(${bgBlur}px) brightness(${100 - bgDarken}%)`
                      : undefined,
                }}
              />
            ))}
          {/* Darken overlay */}
          {bgDarken > 0 && !backgroundUrl && (
            <div
              className="absolute inset-0 bg-black pointer-events-none"
              style={{ opacity: bgDarken / 100 }}
            />
          )}

          {!backgroundUrl && !bgStyle && (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-4">
              <div className="w-20 h-20 rounded-xl bg-white/4 flex items-center justify-center border border-white/6">
                <ImageIcon size={36} className="text-gray-600" />
              </div>
              <p className="text-sm font-medium text-white/20">
                Select a background to start
              </p>
            </div>
          )}

          {elements.map((el) => (
            <DraggableStoryElement
              key={el.id}
              el={el}
              containerRef={containerRef}
              isSelected={selectedElementId === el.id}
              onUpdate={updateElement}
              onSelect={setSelectedElementId}
              setShowVGuide={setShowVGuide}
              setShowHGuide={setShowHGuide}
              setActiveTab={setActiveTab}
              setTextInput={setTextInput}
              setTextColor={setTextColor}
              setTextStyle={setTextStyle}
            />
          ))}

          {showVGuide && (
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[#ff00ea] z-100 pointer-events-none shadow-[0_0_15px_rgba(255,0,234,0.8)]" />
          )}
          {showHGuide && (
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[#ff00ea] z-100 pointer-events-none shadow-[0_0_15px_rgba(255,0,234,0.8)]" />
          )}
        </div>
      </div>

      {/* ─── Bottom Panel ─── */}
      <section
        onPointerDown={(e) => e.stopPropagation()}
        className="bg-zinc-900/95 backdrop-blur-xl border-t border-white/4 z-40 safe-area-bottom max-h-[40vh] overflow-y-auto no-scrollbar"
        aria-label="Herramientas de edición"
      >
        <div className="drag-handle" />

        <AnimatePresence mode="wait">
          {/* === ELEMENT EDIT MODE === */}
          {selectedElementId && selectedElement && (
            <motion.div
              key="element-editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.25 }}
              className="px-4 pb-4 space-y-3"
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
                    {selectedElement.type === 'text' ? (
                      <Type size={14} />
                    ) : (
                      <Smile size={14} />
                    )}
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.15em] text-white/30">
                    Edit {selectedElement.type}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => duplicateElement(selectedElementId)}
                    title="Duplicate"
                    className="p-1 bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveElementLayer(selectedElementId, 'up')}
                    title="Bring forward"
                    className="p-1 bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveElementLayer(selectedElementId, 'down')}
                    title="Send backward"
                    className="p-1 bg-white/4 hover:bg-white/8 text-white/50 hover:text-white/80 rounded-lg border border-white/6 transition-all"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateElement(selectedElementId, { x: 0, y: 0 })
                    }
                    className="text-xs bg-white/4 hover:bg-white/8 px-2.5 py-1.5 rounded-lg border border-white/6 transition-all font-bold text-white/50 hover:text-white/80 flex items-center gap-1"
                  >
                    <Move size={10} /> Center
                  </button>
                  <button
                    type="button"
                    onClick={() => removeElement(selectedElementId)}
                    className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/15 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedElementId(null)}
                    className="p-1 hover:bg-white/5 rounded-lg text-white/30 hover:text-white/60 transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Panel Tabs */}
              <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5">
                {[
                  { id: 'style' as PanelTab, label: 'Style', icon: Palette },
                  {
                    id: 'transform' as PanelTab,
                    label: 'Transform',
                    icon: Move,
                  },
                  { id: 'layers' as PanelTab, label: 'Layers', icon: Layers },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setPanelTab(id)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                      panelTab === id
                        ? 'bg-white/8 text-white'
                        : 'text-white/25 hover:text-white/50'
                    }`}
                  >
                    <Icon size={11} /> {label}
                  </button>
                ))}
              </div>

              {/* STYLE TAB */}
              {panelTab === 'style' && selectedElement.type === 'text' && (
                <div className="space-y-3 animate-slide-up">
                  <textarea
                    ref={editAreaRef}
                    value={textInput}
                    rows={1}
                    onChange={(e) => {
                      setTextInput(e.target.value);
                      updateElement(selectedElementId, {
                        content: e.target.value,
                      });
                    }}
                    className="w-full bg-white/5 text-white px-2 py-1 rounded-xl outline-none border border-white/10 focus:border-blue-500/50 transition-all font-medium text-base resize-none overflow-hidden"
                    placeholder="Type your text..."
                  />

                  {/* Font Selector */}
                  <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
                    {FONTS.map((font) => (
                      <button
                        type="button"
                        key={font.name}
                        onClick={() => {
                          setTextFont(font.name);
                          updateElement(selectedElementId, {
                            fontFamily: font.name,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
                          (selectedElement.fontFamily || 'Outfit') === font.name
                            ? 'bg-white text-black border-white'
                            : 'text-white/40 hover:text-white/70 border-white/6 hover:border-white/15 bg-white/3'
                        }`}
                        style={{ fontFamily: `"${font.name}", ${font.style}` }}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>

                  {/* Text Style + Alignment + Color */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5 overflow-x-auto no-scrollbar">
                      {TEXT_STYLES.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => {
                            setTextStyle(s.id);
                            updateElement(selectedElementId, {
                              textStyle: s.id,
                            });
                          }}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-bold capitalize transition-all whitespace-nowrap ${
                            textStyle === s.id
                              ? 'bg-white text-black'
                              : 'text-white/30 hover:text-white/60'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="w-px h-5 bg-white/6" />
                    {/* Alignment */}
                    <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <button
                          type="button"
                          key={align}
                          onClick={() =>
                            updateElement(selectedElementId, { align })
                          }
                          className={`w-8 h-7 flex items-center justify-center rounded-md transition-all ${
                            (selectedElement.align || 'center') === align
                              ? 'bg-white text-black'
                              : 'text-white/30 hover:text-white/60'
                          }`}
                        >
                          {align === 'left' ? (
                            <AlignLeft size={13} />
                          ) : align === 'center' ? (
                            <AlignCenter size={13} />
                          ) : (
                            <AlignRight size={13} />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="w-px h-5 bg-white/6" />
                    <ColorPicker
                      selectedColor={textColor}
                      onColorSelect={(color) => {
                        setTextColor(color);
                        updateElement(selectedElementId, {
                          color,
                          gradientColors: undefined,
                        });
                      }}
                    />
                  </div>

                  {/* Gradient Text Presets */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white/20 uppercase tracking-wider shrink-0">
                      Gradient
                    </span>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={() =>
                          updateElement(selectedElementId, {
                            gradientColors: undefined,
                          })
                        }
                        className={`w-7 h-7 rounded-full border-2 shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                          !selectedElement.gradientColors
                            ? 'border-white bg-white/10 text-white'
                            : 'border-white/10 text-white/30'
                        }`}
                      >
                        <X size={10} />
                      </button>
                      {GRADIENT_PRESETS.map((g) => (
                        <button
                          type="button"
                          key={g[0]}
                          onClick={() =>
                            updateElement(selectedElementId, {
                              gradientColors: g,
                            })
                          }
                          className={`w-7 h-7 rounded-full shrink-0 border-2 transition-all ${
                            selectedElement.gradientColors?.[0] === g[0]
                              ? 'border-white scale-110'
                              : 'border-transparent'
                          }`}
                          style={{
                            background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSFORM TAB */}
              {panelTab === 'transform' && (
                <div className="space-y-5 animate-slide-up pb-2">
                  {selectedElement.type === 'text' && (
                    <>
                      <div className="pb-3 border-b border-white/5">
                        <SliderControl
                          icon={ALargeSmall}
                          label="Font Size"
                          value={selectedElement.fontSize || 24}
                          min={12}
                          max={120}
                          step={1}
                          unit="px"
                          onChange={(v) =>
                            updateElement(selectedElementId, { fontSize: v })
                          }
                          onDoubleClick={() =>
                            updateElement(selectedElementId, { fontSize: 24 })
                          }
                        />
                      </div>
                      <div className="pb-3 border-b border-white/5">
                        <SliderControl
                          icon={LetterText}
                          label="Spacing"
                          value={selectedElement.letterSpacing || 0}
                          min={-4}
                          max={40}
                          step={0.5}
                          unit="px"
                          onChange={(v) =>
                            updateElement(selectedElementId, {
                              letterSpacing: v,
                            })
                          }
                          onDoubleClick={() =>
                            updateElement(selectedElementId, {
                              letterSpacing: 0,
                            })
                          }
                        />
                      </div>
                    </>
                  )}
                  <div className="pb-3 border-b border-white/5">
                    <SliderControl
                      icon={ZoomIn}
                      label="Scale"
                      value={selectedElement.scale}
                      min={0.1}
                      max={8}
                      step={0.01}
                      unit="×"
                      format={(v) => v.toFixed(2)}
                      onChange={(v) =>
                        updateElement(selectedElementId, { scale: v })
                      }
                      onDoubleClick={() =>
                        updateElement(selectedElementId, { scale: 1 })
                      }
                    />
                  </div>
                  <div className="pb-3 border-b border-white/5">
                    <SliderControl
                      icon={RotateCw}
                      label="Rotation"
                      value={selectedElement.rotation}
                      min={-180}
                      max={180}
                      step={1}
                      unit="°"
                      onChange={(v) =>
                        updateElement(selectedElementId, { rotation: v })
                      }
                      onDoubleClick={() =>
                        updateElement(selectedElementId, { rotation: 0 })
                      }
                    />
                  </div>
                  <div className="pb-3 border-b border-white/5">
                    <SliderControl
                      icon={Eye}
                      label="Opacity"
                      value={Math.round((selectedElement.opacity ?? 1) * 100)}
                      min={0}
                      max={100}
                      step={1}
                      unit="%"
                      onChange={(v) =>
                        updateElement(selectedElementId, { opacity: v / 100 })
                      }
                      onDoubleClick={() =>
                        updateElement(selectedElementId, { opacity: 1 })
                      }
                    />
                  </div>
                  {selectedElement.type === 'text' && (
                    <SliderControl
                      icon={WrapText}
                      label="Width"
                      value={selectedElement.width || 0}
                      min={0}
                      max={800}
                      step={5}
                      unit="px"
                      format={(v) => (v === 0 ? 'Auto' : `${v}px`)}
                      onChange={(v) =>
                        updateElement(selectedElementId, {
                          width: v || undefined,
                        })
                      }
                      onDoubleClick={() =>
                        updateElement(selectedElementId, { width: undefined })
                      }
                    />
                  )}
                </div>
              )}

              {/* LAYERS TAB */}
              {panelTab === 'layers' && (
                <div className="space-y-1.5 animate-slide-up max-h-[25vh] overflow-y-auto no-scrollbar">
                  {[...elements].reverse().map((el) => {
                    return (
                      // biome-ignore lint/a11y/useSemanticElements: Layer item is not a button to avoid nested interactive elements
                      <div
                        key={el.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-all group ${
                          selectedElementId === el.id
                            ? 'bg-white/8 border border-white/15'
                            : 'hover:bg-white/4 border border-transparent'
                        }`}
                        onClick={() => setSelectedElementId(el.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedElementId(el.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="text-lg leading-none">
                          {el.type === 'sticker' ? el.content : '📝'}
                        </span>
                        <span className="flex-1 text-xs font-medium text-white/60 truncate">
                          {el.type === 'text'
                            ? el.content.slice(0, 30)
                            : 'Sticker'}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveElementLayer(el.id, 'up');
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-all"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveElementLayer(el.id, 'down');
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-all"
                          >
                            <ChevronDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateElement(el.id);
                            }}
                            className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white/60 transition-all"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeElement(el.id);
                            }}
                            className="p-1 hover:bg-red-500/20 rounded text-red-400/40 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {elements.length === 0 && (
                    <p className="text-center text-xs text-white/15 py-6">
                      No elements yet
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* === BACKGROUND TAB === */}
          {!selectedElementId && activeTab === 'background' && (
            <motion.div
              key="background-tab"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white/25 uppercase tracking-[0.15em]">
                  Backgrounds
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs bg-white/4 hover:bg-white/8 px-3 py-1.5 rounded-lg border border-white/6 flex items-center gap-1 transition-all font-bold text-white/50 hover:text-white/80"
                >
                  <ImageIcon size={12} /> Upload
                </button>
              </div>
              <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {GRADIENTS.map((grad) => (
                  <button
                    type="button"
                    key={grad}
                    onClick={() => {
                      setBgStyle(grad);
                      setBackground(null);
                      setBackgroundUrl(null);
                    }}
                    className={`w-12 h-[72px] rounded-xl shrink-0 border-2 transition-all duration-200 ${
                      bgStyle === grad
                        ? 'border-white scale-105 shadow-lg'
                        : 'border-transparent hover:border-white/20 opacity-80 hover:opacity-100'
                    }`}
                    style={
                      grad.startsWith('linear-gradient') ||
                      grad.startsWith('radial-gradient')
                        ? { backgroundImage: grad }
                        : { backgroundColor: grad }
                    }
                  />
                ))}
              </div>
              {/* Background Effects */}
              {backgroundUrl && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                  <SliderControl
                    icon={SunDim}
                    label="Blur"
                    value={bgBlur}
                    min={0}
                    max={20}
                    step={0.5}
                    unit="px"
                    onChange={setBgBlur}
                    onDoubleClick={() => setBgBlur(0)}
                  />
                  <SliderControl
                    icon={Eye}
                    label="Darken"
                    value={bgDarken}
                    min={0}
                    max={80}
                    step={1}
                    unit="%"
                    onChange={setBgDarken}
                    onDoubleClick={() => setBgDarken(0)}
                  />
                </div>
              )}
            </motion.div>
          )}

          {/* === TEXT TAB === */}
          {!selectedElementId && activeTab === 'text' && (
            <motion.div
              key="text-tab"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="p-4 space-y-3"
            >
              <div className="flex gap-2 items-start">
                <textarea
                  ref={addAreaRef}
                  value={textInput}
                  rows={1}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Capture some magic..."
                  className="flex-1 bg-white/5 text-white px-2 py-1 rounded-xl outline-none border border-white/10 focus:border-blue-500/50 transition-all font-medium resize-none overflow-hidden"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addText();
                    }
                  }}
                />
                <motion.button
                  type="button"
                  onClick={addText}
                  disabled={!textInput.trim()}
                  className="bg-white text-black h-12 w-12 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all shrink-0"
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus size={20} />
                </motion.button>
              </div>

              <div className="flex gap-1 overflow-x-auto no-scrollbar pb-0.5">
                {FONTS.map((font) => (
                  <button
                    type="button"
                    key={font.name}
                    onClick={() => setTextFont(font.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
                      textFont === font.name
                        ? 'bg-white text-black border-white'
                        : 'text-white/40 hover:text-white/70 border-white/6 hover:border-white/15 bg-white/3'
                    }`}
                    style={{ fontFamily: `"${font.name}", ${font.style}` }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-white/3 p-0.5 rounded-lg border border-white/5 overflow-x-auto no-scrollbar">
                  {TEXT_STYLES.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setTextStyle(s.id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-bold capitalize transition-all whitespace-nowrap ${
                        textStyle === s.id
                          ? 'bg-white text-black'
                          : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-white/6" />
                <ColorPicker
                  selectedColor={textColor}
                  onColorSelect={(color) => setTextColor(color)}
                />
              </div>

              <div className="space-y-2 pt-1">
                <SliderControl
                  icon={ALargeSmall}
                  label="Default Font Size"
                  value={textFontSize}
                  min={12}
                  max={120}
                  step={1}
                  unit="px"
                  onChange={setTextFontSize}
                  onDoubleClick={() => setTextFontSize(24)}
                />
              </div>
            </motion.div>
          )}

          {/* === STICKERS TAB === */}
          {!selectedElementId && activeTab === 'stickers' && (
            <motion.div
              key="stickers-tab"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="p-4 space-y-3"
            >
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {STICKER_CATEGORIES.map((cat, idx) => (
                  <button
                    type="button"
                    key={cat.label}
                    onClick={() => setActiveStickerCategory(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                      activeStickerCategory === idx
                        ? 'bg-white/10 text-white border border-white/10'
                        : 'text-white/25 hover:text-white/50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-8 gap-1">
                {STICKER_CATEGORIES[activeStickerCategory].items.map((s) => (
                  <motion.button
                    type="button"
                    key={s}
                    onClick={() => addSticker(s)}
                    className="text-xl p-2 rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center"
                    whileHover={{ scale: 1.15, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* === POLL TAB === */}
          {!selectedElementId && activeTab === 'poll' && (
            <motion.div
              key="poll-tab"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="p-4 space-y-3 max-w-sm mx-auto"
            >
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 className="text-brand-primary" size={18} />
                <span className="text-xs font-black text-white/50 uppercase tracking-[0.15em]">
                  Encuesta Interactiva
                </span>
              </div>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Escribe tu pregunta..."
                className="w-full bg-white/5 text-white px-3 py-2 rounded-xl outline-none border border-white/10 text-sm font-semibold"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={pollOption1}
                  onChange={(e) => setPollOption1(e.target.value)}
                  placeholder="Opción 1"
                  className="bg-white/5 text-white px-3 py-1.5 rounded-lg outline-none border border-white/10 text-xs"
                />
                <input
                  type="text"
                  value={pollOption2}
                  onChange={(e) => setPollOption2(e.target.value)}
                  placeholder="Opción 2"
                  className="bg-white/5 text-white px-3 py-1.5 rounded-lg outline-none border border-white/10 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={addPoll}
                disabled={!pollQuestion.trim()}
                className="w-full py-2 bg-brand-primary text-white font-bold text-xs uppercase tracking-wider rounded-xl disabled:opacity-30 transition-all shadow-lg shadow-brand-primary/20"
              >
                Añadir Encuesta a la Historia
              </button>
            </motion.div>
          )}

          {/* === TEMPLATES TAB === */}
          {!selectedElementId && activeTab === 'templates' && (
            <motion.div
              key="templates-tab"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="p-4 space-y-3"
            >
              <span className="text-xs font-black text-white/25 uppercase tracking-[0.15em]">
                Templates
              </span>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {TEMPLATES.map((tmpl) => (
                  <button
                    type="button"
                    key={tmpl.name}
                    onClick={() => applyTemplate(tmpl)}
                    className="shrink-0 w-20 flex flex-col items-center gap-1 group"
                  >
                    <div
                      className="w-16 h-24 rounded-xl border-2 border-white/8 group-hover:border-white/25 transition-all overflow-hidden"
                      style={
                        tmpl.bg.startsWith('linear-gradient')
                          ? { backgroundImage: tmpl.bg }
                          : { backgroundColor: tmpl.bg }
                      }
                    >
                      <div className="w-full h-full flex items-center justify-center text-white/60 text-xs font-bold">
                        {tmpl.elements[0]?.type === 'sticker' ? (
                          <span className="text-2xl">
                            {tmpl.elements[0].content}
                          </span>
                        ) : (
                          'Aa'
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-white/30 group-hover:text-white/60 transition-colors">
                      {tmpl.name}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* === COLLAPSED STATE === */}
          {!selectedElementId && activeTab === 'none' && (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-4 flex justify-center"
            >
              <div className="flex items-center gap-2 text-xs text-white/15 font-medium">
                <Layers size={12} />
                <span>
                  {elements.length} element{elements.length !== 1 ? 's' : ''}
                </span>
                {elements.length > 0 && (
                  <>
                    <span>·</span>
                    <span>Tap an element to edit</span>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Reusable Slider Control ───
function SliderControl({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  format,
  onChange,
  onDoubleClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onDoubleClick?: () => void;
}) {
  return (
    <div className="flex items-center gap-5 group py-1">
      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
          height: 20px;
          width: 100%;
        }
        input[type="range"]::-webkit-slider-track {
          height: 4px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          margin-top: -5px;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        input[type="range"]:hover::-webkit-slider-thumb {
          transform: scale(1.15);
          box-shadow: 0 0 16px rgba(59, 130, 246, 0.5);
        }
        input[type="range"]:active::-webkit-slider-thumb {
          transform: scale(0.9);
        }
        input[type="range"]::-moz-range-track {
          height: 4px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
        }
        input[type="range"]::-moz-range-progress {
          height: 4px;
          border-radius: 9999px;
          background: #3b82f6;
        }
      `}</style>
      <div className="w-24 shrink-0 flex items-center gap-2.5">
        <Icon
          size={12}
          className="text-white/20 group-hover:text-blue-400 transition-colors duration-300"
        />
        <span className="text-xs font-black uppercase tracking-[0.15em] text-white/25 truncate group-hover:text-white/60 transition-colors duration-300">
          {label}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number.parseFloat(e.target.value))}
          onDoubleClick={onDoubleClick}
          className="w-full align-middle opacity-80 hover:opacity-100 transition-opacity"
        />
      </div>
      <div className="w-14 shrink-0 text-right">
        <span className="inline-block px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs font-mono font-bold text-blue-400">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
    </div>
  );
}
