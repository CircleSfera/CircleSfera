import { describe, expect, it } from 'vitest';
import {
  parseStickerSettings,
  publicSettings,
} from './story-sticker-settings.js';

describe('what each sticker holds', () => {
  it('keeps a poll question and two to four options, trimmed', () => {
    expect(
      parseStickerSettings('POLL', {
        question: ' ¿Playa? ',
        options: [' Sí', 'No '],
        extra: 'dropped',
      }),
    ).toEqual({ question: '¿Playa?', options: ['Sí', 'No'] });
    expect(() =>
      parseStickerSettings('POLL', { question: 'Q', options: ['Solo'] }),
    ).toThrow('2–4 options');
    expect(() =>
      parseStickerSettings('POLL', {
        question: 'Q',
        options: ['a', 'b', 'c', 'd', 'e'],
      }),
    ).toThrow('2–4 options');
    expect(() =>
      parseStickerSettings('POLL', { question: '', options: ['a', 'b'] }),
    ).toThrow('question');
  });

  it('needs the right option of a quiz to be one of its options', () => {
    expect(
      parseStickerSettings('QUIZ', {
        question: 'Capital?',
        options: ['Madrid', 'Roma'],
        correctIndex: 0,
      }),
    ).toEqual({
      question: 'Capital?',
      options: ['Madrid', 'Roma'],
      correctIndex: 0,
    });
    for (const correctIndex of [2, -1, 0.5, '0', undefined]) {
      expect(() =>
        parseStickerSettings('QUIZ', {
          question: 'Capital?',
          options: ['Madrid', 'Roma'],
          correctIndex,
        }),
      ).toThrow('correctIndex');
    }
  });

  it('keeps a question prompt, a slider emoji, a mention, a place and a hashtag', () => {
    expect(parseStickerSettings('QUESTION', { prompt: 'Pregunta' })).toEqual({
      prompt: 'Pregunta',
    });
    expect(
      parseStickerSettings('SLIDER', { question: '', emoji: '😍' }),
    ).toEqual({ question: '', emoji: '😍' });
    expect(parseStickerSettings('MENTION', { profileId: 'p-1' })).toEqual({
      profileId: 'p-1',
    });
    expect(parseStickerSettings('LOCATION', { placeId: 'pl-1' })).toEqual({
      placeId: 'pl-1',
    });
    expect(parseStickerSettings('HASHTAG', { tag: '#Verano_2026' })).toEqual({
      tag: 'Verano_2026',
    });
  });

  it('refuses a hashtag with spaces or signs, and a slider without emoji', () => {
    expect(() =>
      parseStickerSettings('HASHTAG', { tag: 'dos palabras' }),
    ).toThrow('hashtag');
    expect(() => parseStickerSettings('HASHTAG', { tag: 'a-b' })).toThrow(
      'hashtag',
    );
    expect(() => parseStickerSettings('SLIDER', { question: 'Q' })).toThrow(
      'emoji',
    );
  });
});

describe('what a viewer sees of a sticker', () => {
  const quiz = { question: 'Q', options: ['a', 'b'], correctIndex: 1 };

  it('keeps the right option of a quiz until it is answered', () => {
    expect(publicSettings('QUIZ', quiz, false)).toEqual({
      question: 'Q',
      options: ['a', 'b'],
    });
    expect(publicSettings('QUIZ', quiz, true)).toEqual(quiz);
  });

  it('shows the rest as it is', () => {
    expect(
      publicSettings('POLL', { question: 'Q', options: ['a', 'b'] }, false),
    ).toEqual({ question: 'Q', options: ['a', 'b'] });
  });
});
