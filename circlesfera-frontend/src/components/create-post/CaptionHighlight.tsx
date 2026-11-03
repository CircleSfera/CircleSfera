import { forwardRef, type ReactNode } from 'react';

// A mention or a hashtag: @ or # at the start or after a space, then its word.
const TAGGED = /(^|\s)([@#][\p{L}\p{N}_.]+)/gu;

/** The caption with its mentions and hashtags marked, for the copy below. */
export function markCaption(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TAGGED)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={start} className="text-brand-blue">
        {match[2]}
      </span>,
    );
    last = start + match[2].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/**
 * A copy of the caption laid exactly under its field, as Instagram shows a
 * caption being written: the text in the field is clear and this copy shows
 * through it, with each @mention and #hashtag in blue. It takes the field's
 * own text classes so every line falls in the same place.
 */
export const CaptionHighlight = forwardRef<
  HTMLDivElement,
  { text: string; className: string }
>(function CaptionHighlight({ text, className }, ref) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap wrap-break-word ${className}`}
    >
      {markCaption(text)}
      {/* A last empty line still takes its height, as in the field. */}
      {'​'}
    </div>
  );
});
