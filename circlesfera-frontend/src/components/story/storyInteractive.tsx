import type { StoryStickerInput } from '@circlesfera/shared';
import {
  BadgeCheck,
  BarChart2,
  HelpCircle,
  Link as LinkIcon,
  MapPin,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import type { StoryElement } from '../../types';
import {
  ANSWERABLE_SCALE,
  FREE_SCALE,
  placementFromElement,
  STICKER_WIDTH_PCT,
} from '../../utils/storySticker';
import { CountdownClock } from '../interactive/CountdownClock';
import {
  STICKER_BADGE,
  STICKER_CARD,
  STICKER_HEADER,
  STICKER_LABEL,
  STICKER_ROW,
  STICKER_ROW_PLAIN,
  STICKER_ROW_SHAPE,
  STICKER_TITLE,
} from '../interactive/stickerStyles';

export type PollPayload = { question: string; options: string[] };
export type QnaPayload = { prompt: string };
export type QuizPayload = {
  question: string;
  options: string[];
  correctIndex: number;
};
export type SliderPayload = { question: string; emoji: string };
export type HashtagPayload = { tag: string };
export type MentionPayload = { profileId: string; username: string };
export type LocationPayload = { name: string };
export type AnswerPayload = { prompt: string; answer: string };
export type CountdownPayload = { title: string; endsAt: string };
export type LinkPayload = { url: string; domain: string; label?: string };

const parseJson = (content: string): Record<string, unknown> | null => {
  try {
    const data = JSON.parse(content);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
};

export function parseQuizPayload(el: StoryElement): QuizPayload | null {
  if (el.type !== 'quiz') return null;
  const d = parseJson(el.content);
  if (
    !d ||
    typeof d.question !== 'string' ||
    !Array.isArray(d.options) ||
    typeof d.correctIndex !== 'number'
  ) {
    return null;
  }
  return {
    question: d.question,
    options: d.options.map(String).slice(0, 4),
    correctIndex: d.correctIndex,
  };
}

export function parseSliderPayload(el: StoryElement): SliderPayload | null {
  if (el.type !== 'slider') return null;
  const d = parseJson(el.content);
  if (!d || typeof d.emoji !== 'string') return null;
  return { question: String(d.question ?? ''), emoji: d.emoji };
}

export function parseHashtagPayload(el: StoryElement): HashtagPayload | null {
  if (el.type !== 'hashtag') return null;
  const d = parseJson(el.content);
  return d && typeof d.tag === 'string' ? { tag: d.tag } : null;
}

export function parseMentionPayload(el: StoryElement): MentionPayload | null {
  if (el.type !== 'mention') return null;
  const d = parseJson(el.content);
  return d && typeof d.profileId === 'string' && typeof d.username === 'string'
    ? { profileId: d.profileId, username: d.username }
    : null;
}

export function parseLocationPayload(el: StoryElement): LocationPayload | null {
  if (el.type !== 'location') return null;
  const d = parseJson(el.content);
  return d && typeof d.name === 'string' ? { name: d.name } : null;
}

export function parseCountdownPayload(
  el: StoryElement,
): CountdownPayload | null {
  if (el.type !== 'countdown') return null;
  const d = parseJson(el.content);
  return d && typeof d.title === 'string' && typeof d.endsAt === 'string'
    ? { title: d.title, endsAt: d.endsAt }
    : null;
}

export function parseLinkPayload(el: StoryElement): LinkPayload | null {
  if (el.type !== 'link') return null;
  const d = parseJson(el.content);
  if (!d || typeof d.url !== 'string' || typeof d.domain !== 'string') {
    return null;
  }
  return {
    url: d.url,
    domain: d.domain,
    ...(typeof d.label === 'string' && d.label ? { label: d.label } : {}),
  };
}

/** A story has one place and one link: neither is ever copied. */
export function canDuplicateElement(el: StoryElement): boolean {
  return el.type !== 'location' && el.type !== 'link';
}

/** An answer to a question, shared as a card painted into the story. */
export function parseAnswerPayload(el: StoryElement): AnswerPayload | null {
  if (el.type !== 'answer') return null;
  const d = parseJson(el.content);
  return d && typeof d.prompt === 'string' && typeof d.answer === 'string'
    ? { prompt: d.prompt, answer: d.answer }
    : null;
}

/** Pieces with free sizes that a viewer opens: a hashtag, a mention, a place. */
const PILL_KINDS: ReadonlySet<string> = new Set([
  'hashtag',
  'mention',
  'location',
  'link',
]);

/**
 * Pieces that live on the story instead of in its picture: polls, questions,
 * quizzes, sliders, hashtags, mentions and places. Their sizes are the sizes
 * the server accepts for answerable stickers, except the pills.
 */
export function isLiveElement(el: StoryElement): boolean {
  return (
    isPollElement(el) ||
    isQnaElement(el) ||
    el.type === 'quiz' ||
    el.type === 'slider' ||
    el.type === 'countdown' ||
    PILL_KINDS.has(el.type)
  );
}

/** Answerable pieces keep the sizes of the editor (0.5–1.35). */
export function isAnswerableElement(el: StoryElement): boolean {
  return isLiveElement(el) && !PILL_KINDS.has(el.type);
}

/** Width of a sticker at scale 1, as a share of the story canvas. */
export const INTERACTIVE_WIDTH_PCT = STICKER_WIDTH_PCT;

/** Kinds that carry their own type and are never read by their content. */
const TYPED_KINDS: ReadonlySet<string> = new Set([
  'quiz',
  'slider',
  'answer',
  'countdown',
  ...PILL_KINDS,
]);

export function isPollElement(el: StoryElement): boolean {
  const type = String(el.type);
  if (TYPED_KINDS.has(type)) return false;
  return (
    type === 'poll' ||
    (typeof el.content === 'string' && el.content.startsWith('{"question"'))
  );
}

export function isQnaElement(el: StoryElement): boolean {
  const type = String(el.type);
  if (TYPED_KINDS.has(type)) return false;
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
 * A question and one of its answers, as the author shares it: part of the
 * picture of the new story, not a sticker anyone answers.
 */
export function AnswerCardPreview({ prompt, answer }: AnswerPayload) {
  return (
    <div className={`${STICKER_CARD} w-full pointer-events-none select-none`}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <HelpCircle size={13} strokeWidth={2.5} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-bold text-white leading-snug break-words">
          {prompt}
        </p>
      </div>
      <p className="rounded-xl border border-white/15 bg-surface-high px-3 py-2.5 text-sm font-semibold text-white leading-snug break-words whitespace-pre-wrap">
        {answer}
      </p>
    </div>
  );
}

/**
 * The stickers a composed story is shared with, each with where it sits on
 * a canvas of the given size. A place goes once: the server gives it the
 * story's place.
 */
export function stickersFromElements(
  elements: StoryElement[],
  canvas: { width: number; height: number } | null,
): StoryStickerInput[] {
  if (!canvas) return [];
  const stickers: StoryStickerInput[] = [];
  let hasLocation = false;
  for (const el of elements) {
    const place = placementFromElement(
      el,
      canvas,
      isAnswerableElement(el) ? ANSWERABLE_SCALE : FREE_SCALE,
    );
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
    const quiz = parseQuizPayload(el);
    if (quiz) stickers.push({ kind: 'QUIZ', settings: quiz, ...place });
    const slider = parseSliderPayload(el);
    if (slider) stickers.push({ kind: 'SLIDER', settings: slider, ...place });
    const link = parseLinkPayload(el);
    if (link)
      stickers.push({
        kind: 'LINK',
        settings: {
          url: link.url,
          ...(link.label ? { label: link.label } : {}),
        },
        ...place,
      });
    const countdown = parseCountdownPayload(el);
    if (countdown)
      stickers.push({ kind: 'COUNTDOWN', settings: countdown, ...place });
    const hashtag = parseHashtagPayload(el);
    if (hashtag)
      stickers.push({ kind: 'HASHTAG', settings: hashtag, ...place });
    const mention = parseMentionPayload(el);
    if (mention)
      stickers.push({
        kind: 'MENTION',
        settings: { profileId: mention.profileId },
        ...place,
      });
    if (parseLocationPayload(el) && !hasLocation) {
      hasLocation = true;
      stickers.push({ kind: 'LOCATION', settings: {}, ...place });
    }
  }
  return stickers;
}

const PANEL_WIDTH = 'w-[200px]';

export function QuizStickerPreview({
  quiz,
  label,
  variant = 'canvas',
}: {
  quiz: QuizPayload;
  label: string;
  variant?: 'canvas' | 'panel';
}) {
  return (
    <div
      className={`${STICKER_CARD} pointer-events-none select-none ${
        variant === 'panel' ? PANEL_WIDTH : 'w-full'
      }`}
    >
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <BadgeCheck size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <span className={STICKER_LABEL}>{label}</span>
      </div>
      <p className={STICKER_TITLE}>{quiz.question}</p>
      <div className="space-y-1.5">
        {quiz.options.map((opt, i) => (
          <div
            key={`quiz-opt-${opt}`}
            className={`${STICKER_ROW_SHAPE} flex items-center gap-2 ${
              i === quiz.correctIndex
                ? 'border-green-500 bg-surface-high'
                : STICKER_ROW_PLAIN
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="break-words whitespace-normal min-w-0">{opt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SliderStickerPreview({
  slider,
  label,
  variant = 'canvas',
}: {
  slider: SliderPayload;
  label: string;
  variant?: 'canvas' | 'panel';
}) {
  return (
    <div
      className={`${STICKER_CARD} pointer-events-none select-none ${
        variant === 'panel' ? PANEL_WIDTH : 'w-full'
      }`}
    >
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <SlidersHorizontal size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <span className={STICKER_LABEL}>{label}</span>
      </div>
      {slider.question ? (
        <p className={STICKER_TITLE}>{slider.question}</p>
      ) : null}
      <div className="relative h-11 flex items-center">
        <div className="h-2 w-full rounded-full bg-linear-to-r from-white/20 to-brand-primary/70" />
        <span className="absolute left-1/4 -translate-x-1/2 text-3xl leading-none">
          {slider.emoji}
        </span>
      </div>
    </div>
  );
}

export function CountdownStickerPreview({
  countdown,
  label,
  variant = 'canvas',
}: {
  countdown: CountdownPayload;
  label: string;
  variant?: 'canvas' | 'panel';
}) {
  return (
    <div
      className={`${STICKER_CARD} pointer-events-none select-none ${
        variant === 'panel' ? PANEL_WIDTH : 'w-full'
      }`}
    >
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <Timer size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <span className={STICKER_LABEL}>{label}</span>
      </div>
      {countdown.title ? (
        <p className={STICKER_TITLE}>{countdown.title}</p>
      ) : null}
      <CountdownClock endsAt={countdown.endsAt} />
    </div>
  );
}

/** The look of a pill: white, with the text in the brand's gradient. */
export const PILL =
  'inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.35)]';
export const PILL_TEXT =
  'text-lg font-black tracking-tight text-transparent bg-clip-text bg-linear-to-r from-brand-primary to-brand-blue';

export function HashtagStickerPreview({ tag }: { tag: string }) {
  return (
    <div className={`${PILL} pointer-events-none select-none`}>
      <span className={PILL_TEXT}>#{tag.toUpperCase()}</span>
    </div>
  );
}

export function MentionStickerPreview({ username }: { username: string }) {
  return (
    <div className={`${PILL} pointer-events-none select-none`}>
      <span className={PILL_TEXT}>@{username.toUpperCase()}</span>
    </div>
  );
}

/** A link: its short text, or its domain, after a link sign. */
export function LinkStickerPreview({ link }: { link: LinkPayload }) {
  return (
    <div className={`${PILL} max-w-[260px] pointer-events-none select-none`}>
      <LinkIcon
        size={18}
        strokeWidth={2.6}
        className="shrink-0 text-brand-primary"
        aria-hidden
      />
      <span className={`${PILL_TEXT} truncate`}>
        {(link.label ?? link.domain).toUpperCase()}
      </span>
    </div>
  );
}

export function LocationStickerPreview({ name }: { name: string }) {
  return (
    <div className={`${PILL} max-w-[260px] pointer-events-none select-none`}>
      <MapPin
        size={18}
        strokeWidth={2.6}
        className="shrink-0 text-brand-primary"
        aria-hidden
      />
      <span className={`${PILL_TEXT} truncate`}>{name.toUpperCase()}</span>
    </div>
  );
}
