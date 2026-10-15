import { describe, expect, it } from 'vitest';
import type { StoryElement } from '../../types';
import {
  buildHashtagElement,
  buildPollElement,
  buildQnaElement,
  buildQuizElement,
  buildSliderElement,
  buildStickerElement,
  cleanHashtag,
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
  parseHashtagPayload,
  parsePollPayload,
  parseQnaPayload,
  parseQuizPayload,
  parseSliderPayload,
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
