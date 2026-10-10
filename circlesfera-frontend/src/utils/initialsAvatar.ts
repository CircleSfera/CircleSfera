/**
 * The picture shown for someone who has no profile photo: their initials on
 * a colour of their own.
 *
 * It is drawn here, as an image address the browser needs no network for.
 * The same name always gives the same initials and the same colour, so a
 * person looks the same on every screen, and no name leaves the app.
 */

// Deep enough for white letters to read on each of them.
const COLOURS = [
  '#7c3aed',
  '#4f46e5',
  '#2563eb',
  '#0f766e',
  '#b45309',
  '#be185d',
  '#b91c1c',
  '#4d7c0f',
];

/** Up to two letters: of the first two words, or of the one there is. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join('').toUpperCase();
}

function colourOf(name: string): string {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return COLOURS[hash % COLOURS.length];
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

export function initialsAvatarUrl(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${colourOf(name)}"/><text x="32" y="33" fill="#fff" font-family="Inter,system-ui,sans-serif" font-size="26" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(initialsOf(name))}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
