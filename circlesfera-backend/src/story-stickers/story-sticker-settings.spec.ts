import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // A location holds nothing from the client: it is the story's place.
    expect(parseStickerSettings('LOCATION', { placeId: 'pl-1' })).toEqual({});
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

describe('what a countdown holds', () => {
  // A fixed clock, so the limits are measured from one known moment.
  const now = new Date('2026-10-16T12:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString();

  it('keeps its title, trimmed, and when it ends', () => {
    const endsAt = ahead(3_600_000);
    expect(
      parseStickerSettings('COUNTDOWN', { title: ' Fiesta ', endsAt }),
    ).toEqual({ title: 'Fiesta', endsAt });
  });

  it('takes an end months ahead, up to a year', () => {
    const endsAt = ahead(300 * 24 * 3_600_000);
    expect(
      parseStickerSettings('COUNTDOWN', { title: 'Boda', endsAt }),
    ).toEqual({ title: 'Boda', endsAt });
  });

  it('ends between a minute and a year ahead, with a title of up to 40 characters', () => {
    for (const endsAt of [
      ahead(10_000),
      ahead(366 * 24 * 3_600_000),
      'mañana',
      undefined,
    ]) {
      expect(() =>
        parseStickerSettings('COUNTDOWN', { title: 'T', endsAt }),
      ).toThrow('between a minute and a year');
    }
    expect(() =>
      parseStickerSettings('COUNTDOWN', {
        title: 'x'.repeat(41),
        endsAt: ahead(3_600_000),
      }),
    ).toThrow('title');
  });
});

describe('what a link holds', () => {
  it('keeps the address as the server writes it, its domain, and a short text', () => {
    expect(
      parseStickerSettings('LINK', {
        url: 'https://Shop.example.com/x',
        label: ' Mi tienda ',
      }),
    ).toEqual({
      url: 'https://shop.example.com/x',
      domain: 'shop.example.com',
      label: 'Mi tienda',
    });
    expect(
      parseStickerSettings('LINK', { url: 'https://example.com', label: '' }),
    ).toEqual({ url: 'https://example.com/', domain: 'example.com' });
    expect(() =>
      parseStickerSettings('LINK', {
        url: 'https://example.com',
        label: 'x'.repeat(31),
      }),
    ).toThrow('label');
  });
});

describe('what a music sticker holds', () => {
  it('holds nothing from the app: the server gives it the story’s track', () => {
    expect(parseStickerSettings('MUSIC', { audioId: 'any' })).toEqual({});
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
