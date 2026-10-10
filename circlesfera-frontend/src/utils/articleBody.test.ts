import { describe, expect, it } from 'vitest';
import { linkPieces, parseArticleBody, slugFromTitle } from './articleBody';

describe('the body of an article', () => {
  it('reads paragraphs, headings and lists, and nothing else', () => {
    const body = [
      'First paragraph,',
      'on two lines.',
      '',
      '## A heading',
      'Right after it.',
      '- one',
      '- two',
      '',
      '',
      'Last paragraph.',
    ].join('\r\n');

    expect(parseArticleBody(body)).toEqual([
      { type: 'paragraph', text: 'First paragraph,\non two lines.' },
      { type: 'heading', text: 'A heading' },
      { type: 'paragraph', text: 'Right after it.' },
      { type: 'list', items: ['one', 'two'] },
      { type: 'paragraph', text: 'Last paragraph.' },
    ]);
  });

  it('keeps markup typed in it as text', () => {
    expect(
      parseArticleBody('<script>alert(1)</script>\n# not a heading\n**bold**'),
    ).toEqual([
      {
        type: 'paragraph',
        text: '<script>alert(1)</script>\n# not a heading\n**bold**',
      },
    ]);
  });

  it('starts a paragraph after a list without a blank line, and gives nothing for an empty body', () => {
    expect(parseArticleBody('- one\nThen text')).toEqual([
      { type: 'list', items: ['one'] },
      { type: 'paragraph', text: 'Then text' },
    ]);
    expect(parseArticleBody('  \n\n ')).toEqual([]);
  });

  it('finds web addresses, and leaves the punctuation after them to the sentence', () => {
    expect(
      linkPieces(
        'See https://circlesfera.com/pricing. Or (http://x.io/a?b=1), ok',
      ),
    ).toEqual([
      { text: 'See ' },
      {
        text: 'https://circlesfera.com/pricing',
        href: 'https://circlesfera.com/pricing',
      },
      { text: '. Or (' },
      { text: 'http://x.io/a?b=1', href: 'http://x.io/a?b=1' },
      { text: '), ok' },
    ]);
  });

  it('does not make a link of anything that is not a web address', () => {
    expect(
      linkPieces('javascript:alert(1) and ftp://x and mailto:a@b.c'),
    ).toEqual([{ text: 'javascript:alert(1) and ftp://x and mailto:a@b.c' }]);
    expect(linkPieces('')).toEqual([]);
    expect(linkPieces('https://a.io')).toEqual([
      { text: 'https://a.io', href: 'https://a.io' },
    ]);
  });

  it('proposes an address from a title', () => {
    expect(slugFromTitle('  ¿Cómo verifico mi identidad?  ')).toBe(
      'como-verifico-mi-identidad',
    );
    expect(slugFromTitle('Plans & pricing — 2026')).toBe('plans-pricing-2026');
    expect(slugFromTitle('¿¡!?')).toBe('');
    expect(slugFromTitle(`${'a'.repeat(119)} b`)).toBe('a'.repeat(119));
  });
});
