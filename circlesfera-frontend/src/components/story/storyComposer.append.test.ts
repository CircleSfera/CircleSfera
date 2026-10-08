import { describe, expect, it } from 'vitest';
import {
  buildPollElement,
  buildQnaElement,
  buildStickerElement,
} from './storyComposer.append';
import {
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  QNA_PROMPT_MAX,
} from './storyComposer.constants';
import {
  INTERACTIVE_WIDTH_PCT,
  isPollElement,
  isQnaElement,
  parsePollPayload,
  parseQnaPayload,
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
      option1: ' Playa ',
      option2: ' Montaña ',
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

  it('does not build a poll without a question', () => {
    expect(
      buildPollElement({ question: '   ', option1: 'a', option2: 'b' }),
    ).toBeNull();
  });

  it('cuts the question and the options of a poll at their limits', () => {
    const poll = buildPollElement({
      question: 'q'.repeat(POLL_QUESTION_MAX + 20),
      option1: 'a'.repeat(POLL_OPTION_MAX + 5),
      option2: 'b'.repeat(POLL_OPTION_MAX + 5),
    });

    const payload = parsePollPayload(poll?.content ?? '');
    expect(payload?.question).toHaveLength(POLL_QUESTION_MAX);
    expect(payload?.options[0]).toHaveLength(POLL_OPTION_MAX);
    expect(payload?.options[1]).toHaveLength(POLL_OPTION_MAX);
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
