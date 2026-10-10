/** One piece of the body of an article. */
export type ArticleBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

/**
 * The body of an article, written as text, in pieces: `## ` starts a
 * heading, `- ` a list item, and a blank line ends a paragraph. Nothing else
 * is interpreted: markup typed in it stays text.
 */
export function parseArticleBody(body: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      paragraph = [];
    }
    if (items.length > 0) {
      blocks.push({ type: 'list', items });
      items = [];
    }
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0) flush();
      items.push(line.slice(2).trim());
    } else {
      if (items.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** A piece of text, or a web address found in it. */
export type TextPiece = { text: string; href?: string };

/** Splits a text at the web addresses in it, so they can be links. */
export function linkPieces(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let last = 0;
  for (const found of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    // A full stop or a bracket after an address belongs to the sentence.
    const href = found[0].replace(/[.,;:!?)\]]+$/, '');
    const start = found.index ?? 0;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: href, href });
    last = start + href.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

/** The address of an article proposed from its title. */
export function slugFromTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/, '');
}
