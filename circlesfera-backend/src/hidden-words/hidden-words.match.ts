// What a hidden word matches: letters compared without case or accents, a
// word or phrase only as a whole (so "ass" does not hide "class"), and an
// emoji or symbol anywhere.
export function normalizeHiddenWord(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const WORDLIKE = /[\p{L}\p{N}]/u;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function containsHiddenWord(text: string, words: string[]): boolean {
  if (words.length === 0 || !text) return false;
  const haystack = normalizeHiddenWord(text);
  return words.some((word) => {
    if (!word) return false;
    if (!WORDLIKE.test(word)) return haystack.includes(word);
    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(word).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`,
      'u',
    ).test(haystack);
  });
}
