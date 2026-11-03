/** The shortest word after @ or # that is looked up, as the server asks. */
export const SUGGEST_MIN_CHARS = 2;

/** A mention or a hashtag being written, and where it starts. */
export interface CaptionToken {
  kind: 'mention' | 'hashtag';
  query: string;
  start: number;
}

// The word right before the cursor, when it starts with @ or # after a
// space or at the start of the text.
const TOKEN = /(^|\s)([@#])([\p{L}\p{N}_.]*)$/u;

/** The mention or hashtag being written where the cursor is, if any. */
export function tokenAt(text: string, cursor: number): CaptionToken | null {
  const match = TOKEN.exec(text.slice(0, cursor));
  if (!match) return null;
  const [, , sign, query] = match;
  return {
    kind: sign === '@' ? 'mention' : 'hashtag',
    query,
    start: cursor - query.length - 1,
  };
}

/**
 * The text with the word being written replaced by the one chosen, and a
 * space after it; with where the cursor goes next.
 */
export function completeToken(
  text: string,
  token: CaptionToken,
  cursor: number,
  value: string,
): { text: string; cursor: number } {
  const sign = token.kind === 'mention' ? '@' : '#';
  const inserted = `${sign}${value} `;
  const after = text.slice(cursor).replace(/^\S*/u, '').replace(/^ /, '');
  return {
    text: text.slice(0, token.start) + inserted + after,
    cursor: token.start + inserted.length,
  };
}
