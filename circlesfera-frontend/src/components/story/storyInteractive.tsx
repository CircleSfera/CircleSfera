import { BarChart2, HelpCircle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { StoryElement } from '../../types';

export type PollPayload = { question: string; options: string[] };
export type QnaPayload = { prompt: string };

export const INTERACTIVE_WIDTH_PCT = 82; // % of story canvas at scale 1×

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
      className={`rounded-2xl border-2 border-white/20 bg-[#1c1c20] text-left shadow-[0_10px_32px_rgba(0,0,0,0.65)] pointer-events-none select-none ${
        variant === 'panel' ? 'w-[200px] p-3' : 'w-full p-3'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-primary text-white shrink-0">
          <BarChart2 size={13} strokeWidth={2.5} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
          {label}
        </span>
      </div>
      <p className="text-[13px] font-bold text-white leading-snug break-words whitespace-normal mb-2.5">
        {question}
      </p>
      <div className="space-y-1.5">
        {safeOptions.map((opt) => (
          <div
            key={`poll-opt-${opt}`}
            className="w-full rounded-xl border border-white/15 bg-[#2a2a30] px-3 py-2 text-xs font-semibold text-white flex items-center justify-between gap-2"
          >
            <span className="break-words whitespace-normal min-w-0">{opt}</span>
            <span className="text-[10px] text-white/35 font-bold shrink-0">
              —
            </span>
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
      className={`rounded-2xl border-2 border-brand-primary/55 bg-[#241538] text-left shadow-[0_10px_32px_rgba(0,0,0,0.65)] pointer-events-none select-none ${
        variant === 'panel' ? 'w-[200px] p-3' : 'w-full p-3'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-primary text-white shrink-0">
          <HelpCircle size={13} strokeWidth={2.5} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">
          {label}
        </span>
      </div>
      <p className="text-[13px] font-bold text-white leading-snug break-words whitespace-normal mb-2.5">
        {prompt}
      </p>
      <div className="rounded-xl border border-white/15 bg-[#1a1028] px-3 py-2.5 text-[11px] text-white/55 font-medium">
        {hint}
      </div>
    </div>
  );
}
