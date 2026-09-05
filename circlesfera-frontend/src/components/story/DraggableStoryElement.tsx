import { motion, useMotionValue } from 'framer-motion';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import {
  INTERACTIVE_WIDTH_PCT,
  isPollElement,
  isQnaElement,
  PollStickerPreview,
  parsePollPayload,
  parseQnaPayload,
  QnaStickerPreview,
  useStoryCanvasWidth,
} from './storyInteractive';
import { getTextStyleCSS } from './storyTextStyles';

export interface DraggableStoryElementProps {
  el: StoryElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isSelected: boolean;
  hidden?: boolean;
  dimmed?: boolean;
  onUpdate: (id: string, updates: Partial<StoryElement>) => void;
  onSelect: (id: string) => void;
  onDragActiveChange: (active: boolean) => void;
  setShowVGuide: (show: boolean) => void;
  setShowHGuide: (show: boolean) => void;
  onTextEdit: (el: StoryElement) => void;
}

export default function DraggableStoryElement({
  el,
  containerRef,
  isSelected,
  hidden,
  dimmed,
  onUpdate,
  onSelect,
  onDragActiveChange,
  setShowVGuide,
  setShowHGuide,
  onTextEdit,
}: DraggableStoryElementProps) {
  const { t } = useTranslation();
  const elementRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);
  const x = useMotionValue(el.x);
  const y = useMotionValue(el.y);
  const poll = isPollElement(el) ? parsePollPayload(el.content) : null;
  const qna = isQnaElement(el) ? parseQnaPayload(el.content) : null;
  const isInteractive = Boolean(poll || qna);
  const canvasWidth = useStoryCanvasWidth(containerRef);
  const interactivePx =
    canvasWidth > 0
      ? Math.round((canvasWidth * INTERACTIVE_WIDTH_PCT) / 100)
      : undefined;

  useEffect(() => {
    x.set(el.x);
    y.set(el.y);
  }, [el.x, el.y, x, y]);

  if (hidden) return null;

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
        dragMovedRef.current = true;
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
      onDragStart={() => {
        dragMovedRef.current = false;
        onSelect(el.id);
        onDragActiveChange(true);
      }}
      onDragEnd={(_, info) => {
        if (Math.hypot(info.offset.x, info.offset.y) > 3) {
          dragMovedRef.current = true;
        }
        onDragActiveChange(false);
        setShowVGuide(false);
        setShowHGuide(false);
        onUpdate(el.id, { x: x.get(), y: y.get() });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dragMovedRef.current = false;
          });
        });
      }}
      initial={false}
      animate={{
        scale: el.scale,
        rotate: el.rotation,
        borderColor: isSelected ? 'rgba(255,255,255,0.55)' : 'transparent',
        opacity: dimmed ? 0.4 : isInteractive ? 1 : (el.opacity ?? 1),
      }}
      style={{
        x,
        y,
        left: '50%',
        top: '50%',
        zIndex: isSelected ? 200 : (el.zIndex ?? 100),
        position: 'absolute',
        width: isInteractive ? interactivePx : undefined,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTap={(event) => {
        if (dragMovedRef.current) return;
        if (event && 'stopPropagation' in event)
          (event as MouseEvent | TouchEvent).stopPropagation();
        onSelect(el.id);
        if (el.type === 'text') {
          onTextEdit(el);
        }
      }}
      className={`absolute cursor-move touch-none border-2 rounded-2xl p-0.5 transition-colors ${
        isSelected ? 'border-white/55' : 'border-transparent'
      }`}
    >
      {poll ? (
        <PollStickerPreview
          question={poll.question}
          options={poll.options}
          label={t('createPost.storyComposer.tool_poll')}
        />
      ) : qna ? (
        <QnaStickerPreview
          prompt={qna.prompt}
          label={t('createPost.storyComposer.tool_qna')}
          hint={t('createPost.storyComposer.qna_preview_hint')}
        />
      ) : (
        <div
          className={`relative rounded-lg flex items-center justify-center select-none transition-all duration-300
          ${el.type === 'sticker' ? 'text-6xl' : ''}
          ${
            el.textStyle === 'box' || el.textStyle === 'box-shadow'
              ? 'bg-black/70 backdrop-blur-md px-2.5 py-1'
              : el.type === 'text'
                ? 'px-1 py-0.5'
                : ''
          }
          ${el.textStyle === 'box-shadow' ? 'shadow-[0_10px_30px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]' : ''}
          ${el.textStyle === 'neon' ? 'font-bold' : ''}
        `}
          style={getTextStyleCSS(el)}
        >
          {el.content}
        </div>
      )}
    </motion.div>
  );
}
