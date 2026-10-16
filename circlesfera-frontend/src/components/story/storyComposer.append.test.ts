import { describe, expect, it } from 'vitest';
import type { StoryElement } from '../../types';
import {
  buildAnswerElement,
  buildCountdownElement,
  buildHashtagElement,
  buildLinkElement,
  buildLocationElement,
  buildMentionElement,
  buildPollElement,
  buildQnaElement,
  buildQuizElement,
  buildSliderElement,
  buildStickerElement,
  cleanHashtag,
  cleanLink,
} from './storyComposer.append';
import {
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  QNA_PROMPT_MAX,
} from './storyComposer.constants';
import {
  INTERACTIVE_WIDTH_PCT,
  isAnswerableElement,
  isLiveElement,
  isPollElement,
  isQnaElement,
  parseAnswerPayload,
  parseCountdownPayload,
  parseHashtagPayload,
  parseLinkPayload,
  parseLocationPayload,
  parseMentionPayload,
  parsePollPayload,
  parseQnaPayload,
  parseQuizPayload,
  parseSliderPayload,
  stickersFromElements,
} from './storyInteractive';

describe('story elements built from the panels', () => {
  it('places a sticker in the centre, slightly enlarged', () => {
    const sticker = buildStickerElement('🔥');

    expect(sticker).toMatchObject({
      type: 'sticker',
      content: '🔥',
      x: 0,
      y: 0,
      scale: 1.2,
      rotation: 0,
      opacity: 1,
    });
    expect(buildStickerElement('🔥').id).not.toBe(sticker.id);
  });

  it('builds a poll that reads back as question and two options', () => {
    const poll = buildPollElement({
      question: '  ¿Playa o montaña?  ',
      options: [' Playa ', ' Montaña '],
      defaultOptions: ['Sí', 'No'],
    });

    expect(poll).not.toBeNull();
    if (!poll) return;
    expect(poll.type).toBe('poll');
    expect(poll.width).toBe(INTERACTIVE_WIDTH_PCT);
    expect(isPollElement(poll)).toBe(true);
    expect(parsePollPayload(poll.content)).toEqual({
      question: '¿Playa o montaña?',
      options: ['Playa', 'Montaña'],
    });
  });

  it('fills an answer left empty with the default in the app language', () => {
    const poll = buildPollElement({
      question: '¿Vienes?',
      options: ['   ', ''],
      defaultOptions: ['Sí', 'No'],
    });

    expect(parsePollPayload(poll?.content ?? '')?.options).toEqual([
      'Sí',
      'No',
    ]);
  });

  it('does not build a poll without a question', () => {
    expect(
      buildPollElement({
        question: '   ',
        options: ['a', 'b'],
        defaultOptions: ['Sí', 'No'],
      }),
    ).toBeNull();
  });

  it('cuts the question and the options of a poll at their limits', () => {
    const poll = buildPollElement({
      question: 'q'.repeat(POLL_QUESTION_MAX + 20),
      options: [
        'a'.repeat(POLL_OPTION_MAX + 5),
        'b'.repeat(POLL_OPTION_MAX + 5),
      ],
      defaultOptions: ['Sí', 'No'],
    });

    const payload = parsePollPayload(poll?.content ?? '');
    expect(payload?.question).toHaveLength(POLL_QUESTION_MAX);
    expect(payload?.options[0]).toHaveLength(POLL_OPTION_MAX);
    expect(payload?.options[1]).toHaveLength(POLL_OPTION_MAX);
  });

  it('keeps up to four answers of a poll, and needs two', () => {
    const four = buildPollElement({
      question: 'Q',
      options: ['a', 'b', 'c', 'd', 'e'],
      defaultOptions: ['Sí', 'No'],
    });
    expect(parsePollPayload(four?.content ?? '')?.options).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    // A third answer left empty is dropped, not filled.
    const two = buildPollElement({
      question: 'Q',
      options: ['a', 'b', '  '],
      defaultOptions: ['Sí', 'No'],
    });
    expect(parsePollPayload(two?.content ?? '')?.options).toEqual(['a', 'b']);
  });

  it('builds a quiz with its right answer, and refuses one with an empty or missing option', () => {
    const quiz = buildQuizElement({
      question: ' ¿Capital? ',
      options: [' Madrid ', 'Roma'],
      correctIndex: 0,
    });
    expect(quiz && parseQuizPayload(quiz)).toEqual({
      question: '¿Capital?',
      options: ['Madrid', 'Roma'],
      correctIndex: 0,
    });
    expect(isLiveElement(quiz as StoryElement)).toBe(true);
    expect(
      buildQuizElement({ question: 'Q', options: ['a', ''], correctIndex: 0 }),
    ).toBeNull();
    expect(
      buildQuizElement({ question: 'Q', options: ['a', 'b'], correctIndex: 2 }),
    ).toBeNull();
    expect(
      buildQuizElement({ question: '', options: ['a', 'b'], correctIndex: 0 }),
    ).toBeNull();
  });

  it('builds a slider with its emoji, its question may be empty', () => {
    const slider = buildSliderElement({ question: '  ', emoji: '🔥' });
    expect(slider && parseSliderPayload(slider)).toEqual({
      question: '',
      emoji: '🔥',
    });
    expect(isAnswerableElement(slider as StoryElement)).toBe(true);
  });

  it('builds a hashtag without its # and refuses spaces and signs', () => {
    expect(cleanHashtag(' #Verano_2026 ')).toBe('Verano_2026');
    expect(cleanHashtag('dos palabras')).toBe('dospalabras');
    expect(cleanHashtag('a-b')).toBeNull();
    expect(cleanHashtag('#')).toBeNull();
    const tag = buildHashtagElement('#verano');
    expect(tag && parseHashtagPayload(tag)).toEqual({ tag: 'verano' });
    // Live on the story but sized freely, as text.
    expect(isLiveElement(tag as StoryElement)).toBe(true);
    expect(isAnswerableElement(tag as StoryElement)).toBe(false);
  });

  it('builds a question box that reads back as its prompt', () => {
    const qna = buildQnaElement('  Pregúntame lo que quieras  ');

    expect(qna).not.toBeNull();
    if (!qna) return;
    expect(isQnaElement(qna)).toBe(true);
    expect(parseQnaPayload(qna.content)).toEqual({
      prompt: 'Pregúntame lo que quieras',
    });
  });

  it('does not build a question box without a prompt, and cuts a long one', () => {
    expect(buildQnaElement('  ')).toBeNull();

    const qna = buildQnaElement('p'.repeat(QNA_PROMPT_MAX + 30));
    expect(parseQnaPayload(qna?.content ?? '')?.prompt).toHaveLength(
      QNA_PROMPT_MAX,
    );
  });

  it('reads nothing from content that is not a poll or a question box', () => {
    expect(parsePollPayload('not json')).toBeNull();
    expect(parsePollPayload(JSON.stringify({ prompt: 'x' }))).toBeNull();
    expect(parseQnaPayload('not json')).toBeNull();
    expect(parseQnaPayload(JSON.stringify({ question: 'x' }))).toBeNull();
  });
});

describe('mentions and places', () => {
  const canvas = { width: 400, height: 800 };

  it('are pills with free sizes, live on the story and never answered', () => {
    const mention = buildMentionElement({ id: 'p-ana', username: 'ana' });
    const place = buildLocationElement('Madrid');

    expect(parseMentionPayload(mention)).toEqual({
      profileId: 'p-ana',
      username: 'ana',
    });
    expect(parseLocationPayload(place)).toEqual({ name: 'Madrid' });
    for (const el of [mention, place]) {
      expect(isLiveElement(el)).toBe(true);
      expect(isAnswerableElement(el)).toBe(false);
      expect(isPollElement(el)).toBe(false);
    }
    expect(parseMentionPayload({ ...mention, content: '{}' })).toBeNull();
    expect(parseLocationPayload({ ...place, content: 'x' })).toBeNull();
    expect(parseMentionPayload(place)).toBeNull();
  });

  it('go with the story as the profile mentioned and one place, which the server fills', () => {
    const big = {
      ...buildMentionElement({ id: 'p-ana', username: 'ana' }),
      scale: 4,
    };
    const place = buildLocationElement('Madrid');

    const stickers = stickersFromElements(
      [big, place, { ...place, id: 'copy' }],
      canvas,
    );

    expect(stickers).toEqual([
      expect.objectContaining({
        kind: 'MENTION',
        settings: { profileId: 'p-ana' },
        scale: 4,
      }),
      expect.objectContaining({ kind: 'LOCATION', settings: {} }),
    ]);
  });
});

describe('an answer shared as a story', () => {
  it('is a card of the picture: not a question anyone answers, never sent as a sticker', () => {
    const card = buildAnswerElement({ prompt: 'Ask me', answer: 'Why?' });

    expect(parseAnswerPayload(card)).toEqual({
      prompt: 'Ask me',
      answer: 'Why?',
    });
    expect(isLiveElement(card)).toBe(false);
    expect(isQnaElement(card)).toBe(false);
    expect(isPollElement(card)).toBe(false);
    expect(card.width).toBe(INTERACTIVE_WIDTH_PCT);
    expect(stickersFromElements([card], { width: 400, height: 800 })).toEqual(
      [],
    );
    expect(parseAnswerPayload({ ...card, content: '{}' })).toBeNull();
  });

  it('keeps the question within the length of a question sticker', () => {
    const card = buildAnswerElement({
      prompt: 'x'.repeat(QNA_PROMPT_MAX + 20),
      answer: 'A',
    });
    expect(parseAnswerPayload(card)?.prompt).toHaveLength(QNA_PROMPT_MAX);
  });
});

describe('a countdown', () => {
  const canvas = { width: 400, height: 800 };

  it('is a sticker answered on the story, sent with its title and end', () => {
    const endsAt = new Date(Date.now() + 3_600_000);
    const el = buildCountdownElement({ title: ' Fiesta ', endsAt });
    if (!el) throw new Error('no countdown');

    expect(parseCountdownPayload(el)).toEqual({
      title: 'Fiesta',
      endsAt: endsAt.toISOString(),
    });
    expect(isLiveElement(el)).toBe(true);
    expect(isAnswerableElement(el)).toBe(true);
    expect(stickersFromElements([el], canvas)).toEqual([
      expect.objectContaining({
        kind: 'COUNTDOWN',
        settings: { title: 'Fiesta', endsAt: endsAt.toISOString() },
      }),
    ]);
  });

  it('needs a title and an end at least a minute ahead', () => {
    const soon = new Date(Date.now() + 10_000);
    expect(buildCountdownElement({ title: 'Fiesta', endsAt: soon })).toBeNull();
    expect(
      buildCountdownElement({
        title: '  ',
        endsAt: new Date(Date.now() + 3_600_000),
      }),
    ).toBeNull();
  });
});

describe('a link', () => {
  it('takes an address as typed, adding https, and refuses http and names without a dot', () => {
    expect(cleanLink('example.com/shop')).toEqual({
      url: 'https://example.com/shop',
      domain: 'example.com',
    });
    expect(cleanLink(' https://www.Example.com ')).toEqual({
      url: 'https://www.example.com/',
      domain: 'example.com',
    });
    expect(cleanLink('http://example.com')).toBe('http');
    for (const bad of ['', 'intranet', 'ftp://example.com', 'https://']) {
      expect(cleanLink(bad)).toBeNull();
    }
  });

  it('is a pill live on the story, sent with its address and its short text only', () => {
    const el = buildLinkElement({
      url: 'example.com',
      label: ' Mi tienda ',
    });
    if (!el) throw new Error('no link');

    expect(parseLinkPayload(el)).toEqual({
      url: 'https://example.com/',
      domain: 'example.com',
      label: 'Mi tienda',
    });
    expect(isLiveElement(el)).toBe(true);
    expect(isAnswerableElement(el)).toBe(false);
    expect(stickersFromElements([el], { width: 400, height: 800 })).toEqual([
      expect.objectContaining({
        kind: 'LINK',
        settings: { url: 'https://example.com/', label: 'Mi tienda' },
      }),
    ]);
    expect(buildLinkElement({ url: 'http://example.com' })).toBeNull();
    const plain = buildLinkElement({ url: 'example.com', label: ' ' });
    expect(plain && parseLinkPayload(plain)).toEqual({
      url: 'https://example.com/',
      domain: 'example.com',
    });
  });
});
