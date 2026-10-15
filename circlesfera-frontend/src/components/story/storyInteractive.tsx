import type { StoryStickerInput } from '@circlesfera/shared';
import { BarChart2, HelpCircle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { StoryElement } from '../../types';
import {
  placementFromElement,
  STICKER_WIDTH_PCT,
} from '../../utils/storySticker';
import {
  STICKER_BADGE,
  STICKER_CARD,
  STICKER_HEADER,
  STICKER_LABEL,
  STICKER_ROW,
  STICKER_TITLE,
} from '../interactive/stickerStyles';

export type PollPayload = { question: string; options: string[] };
export type QnaPayload = { prompt: string };

/** Width of a sticker at scale 1, as a share of the story canvas. */
export const INTERACTIVE_WIDTH_PCT = STICKER_WIDTH_PCT;

export function isPollElement(el: StoryElement): boolean {
  const type = String(el.type);
  return (
    type === 'poll' ||
    (typeof el.content === 'string' && el.content.startsWith('{"question"'))
  );
}

export function isQnaElement(el: StoryElement): boolean {
  const type = String(el.type);
  return (
    type === 'qna' ||
    (typeof el.content === 'string' && el.content.startsWith('{"prompt"'))
  );
}

export function parsePollPayload(content: string): PollPayload | null {
  try {
    const data = JSON.parse(content) as PollPayload;
    if (data?.question && Array.isArray(data.options)) {
      return {
        question: String(data.question),
        options: data.options.map(String).slice(0, 4),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function parseQnaPayload(content: string): QnaPayload | null {
  try {
    const data = JSON.parse(content) as QnaPayload;
    if (data?.prompt) return { prompt: String(data.prompt) };
  } catch {
    /* ignore */
  }
  return null;
}

export function useStoryCanvasWidth(
  containerRef: React.RefObject<HTMLDivElement | null>,
): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [containerRef]);
  return width;
}

export function PollStickerPreview({
  question,
  options,
  label,
  variant = 'canvas',
}: {
  question: string;
  options: string[];
  label: string;
  variant?: 'canvas' | 'panel';
}) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div
      className={`${STICKER_CARD} pointer-events-none select-none ${
        variant === 'panel' ? 'w-[200px]' : 'w-full'
      }`}
    >
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <BarChart2 size={13} strokeWidth={2.5} />
        </span>
        <span className={STICKER_LABEL}>{label}</span>
      </div>
      <p className={STICKER_TITLE}>{question}</p>
      <div className="space-y-1.5">
        {safeOptions.map((opt) => (
          <div
            key={`poll-opt-${opt}`}
            className={`${STICKER_ROW} flex items-center`}
          >
            <span className="break-words whitespace-normal min-w-0">{opt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QnaStickerPreview({
  prompt,
  label,
  hint,
  variant = 'canvas',
}: {
  prompt: string;
  label: string;
  hint: string;
  variant?: 'canvas' | 'panel';
}) {
  return (
    <div
      className={`${STICKER_CARD} pointer-events-none select-none ${
        variant === 'panel' ? 'w-[200px]' : 'w-full'
      }`}
    >
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <HelpCircle size={13} strokeWidth={2.5} />
        </span>
        <span className={STICKER_LABEL}>{label}</span>
      </div>
      <p className={STICKER_TITLE}>{prompt}</p>
      <div
        className={`${STICKER_ROW} flex items-center text-white/55 font-medium`}
      >
        {hint}
      </div>
    </div>
  );
}

/**
 * The stickers a composed story is shared with: its polls and questions,
 * each with where it sits on a canvas of the given size.
 */
export function stickersFromElements(
  elements: StoryElement[],
  canvas: { width: number; height: number } | null,
): StoryStickerInput[] {
  if (!canvas) return [];
  const stickers: StoryStickerInput[] = [];
  for (const el of elements) {
    const place = placementFromElement(el, canvas);
    if (!place) continue;
    const poll = isPollElement(el) ? parsePollPayload(el.content) : null;
    if (poll) {
      stickers.push({
        kind: 'POLL',
        settings: { question: poll.question, options: poll.options },
        ...place,
      });
      continue;
    }
    const qna = isQnaElement(el) ? parseQnaPayload(el.content) : null;
    if (qna) {
      stickers.push({
        kind: 'QUESTION',
        settings: { prompt: qna.prompt },
        ...place,
      });
    }
  }
  return stickers;
}
