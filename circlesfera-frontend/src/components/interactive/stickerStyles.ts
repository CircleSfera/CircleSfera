/**
 * One look for a poll or a question: in the story composer, on a story and on
 * a post. Built from the surface and brand tokens.
 */
export const STICKER_CARD =
  'rounded-2xl border border-white/15 bg-surface-raised p-3 text-left shadow-[0_10px_32px_rgba(0,0,0,0.5)]';
export const STICKER_HEADER = 'flex items-center gap-1.5 mb-2';
export const STICKER_BADGE =
  'flex h-6 w-6 items-center justify-center rounded-lg bg-brand-primary text-white shrink-0';
export const STICKER_LABEL =
  'text-xs font-bold uppercase tracking-wider text-white/80';
export const STICKER_TITLE =
  'text-sm font-bold text-white leading-snug break-words whitespace-normal mb-2.5';
/**
 * The shape of an answer of a poll or a quiz, or of the field of a question,
 * without its colours, for rows whose colour says something (chosen, right,
 * wrong): one border colour each, so none overrides another.
 */
export const STICKER_ROW_SHAPE =
  'w-full min-h-11 rounded-xl border px-3 text-xs font-semibold text-white';
/** The plain colours of a row. */
export const STICKER_ROW_PLAIN = 'border-white/15 bg-surface-high';
/** An answer of a poll, or the field of a question. */
export const STICKER_ROW = `${STICKER_ROW_SHAPE} ${STICKER_ROW_PLAIN}`;
