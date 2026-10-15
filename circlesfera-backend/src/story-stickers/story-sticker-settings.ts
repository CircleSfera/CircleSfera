import { BadRequestException } from '@nestjs/common';
import { StoryStickerKind } from '@prisma/client';

/** Limits of what a sticker holds. Keep in line with the story editor. */
export const STICKER_LIMITS = {
  questionMax: 120,
  optionMax: 32,
  minOptions: 2,
  maxOptions: 4,
  promptMax: 120,
  emojiMax: 8,
  tagMax: 50,
  answerMax: 500,
  perStory: 10,
} as const;

export type StickerSettings =
  | { question: string; options: string[] } // POLL
  | { question: string; options: string[]; correctIndex: number } // QUIZ
  | { prompt: string } // QUESTION
  | { question: string; emoji: string } // SLIDER
  | { profileId: string } // MENTION
  | { placeId: string } // LOCATION
  | { tag: string }; // HASHTAG

const fail = (message: string): never => {
  throw new BadRequestException(`STICKER_SETTINGS_INVALID: ${message}`);
};

const text = (value: unknown, field: string, max: number, min = 1) => {
  if (typeof value !== 'string') return fail(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return fail(`${field} must be ${min}–${max} characters`);
  }
  return trimmed;
};

const options = (value: unknown) => {
  if (!Array.isArray(value)) return fail('options must be a list');
  if (
    value.length < STICKER_LIMITS.minOptions ||
    value.length > STICKER_LIMITS.maxOptions
  ) {
    return fail(
      `a sticker has ${STICKER_LIMITS.minOptions}–${STICKER_LIMITS.maxOptions} options`,
    );
  }
  return value.map((o) => text(o, 'option', STICKER_LIMITS.optionMax));
};

/**
 * Checks what a sticker of a kind holds and keeps only that, trimmed. A
 * mention names a profile and a location a place; whether they exist is
 * checked by the service.
 */
export function parseStickerSettings(
  kind: StoryStickerKind,
  raw: unknown,
): StickerSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  switch (kind) {
    case 'POLL':
      return {
        question: text(s.question, 'question', STICKER_LIMITS.questionMax),
        options: options(s.options),
      };
    case 'QUIZ': {
      const list = options(s.options);
      const correct = s.correctIndex;
      if (
        typeof correct !== 'number' ||
        !Number.isInteger(correct) ||
        correct < 0 ||
        correct >= list.length
      ) {
        fail('correctIndex must be one of the options');
      }
      return {
        question: text(s.question, 'question', STICKER_LIMITS.questionMax),
        options: list,
        correctIndex: correct as number,
      };
    }
    case 'QUESTION':
      return { prompt: text(s.prompt, 'prompt', STICKER_LIMITS.promptMax) };
    case 'SLIDER':
      return {
        question: text(s.question, 'question', STICKER_LIMITS.questionMax, 0),
        emoji: text(s.emoji, 'emoji', STICKER_LIMITS.emojiMax),
      };
    case 'MENTION':
      return { profileId: text(s.profileId, 'profileId', 64) };
    case 'LOCATION':
      return { placeId: text(s.placeId, 'placeId', 64) };
    case 'HASHTAG': {
      const tag = text(s.tag, 'tag', STICKER_LIMITS.tagMax + 1).replace(
        /^#/,
        '',
      );
      if (!/^[\p{L}\p{N}_]{1,50}$/u.test(tag)) {
        fail('a hashtag is letters, numbers and _');
      }
      return { tag };
    }
    default:
      return fail('unknown kind');
  }
}

/**
 * What a viewer may see of a sticker's settings: the right option of a quiz
 * is kept from a viewer until they have answered.
 */
export function publicSettings(
  kind: StoryStickerKind,
  settings: unknown,
  revealAnswer: boolean,
): Record<string, unknown> {
  const s = { ...((settings ?? {}) as Record<string, unknown>) };
  if (kind === 'QUIZ' && !revealAnswer) delete s.correctIndex;
  return s;
}

/** Kinds a viewer answers, and kinds a viewer answers once. */
export const ANSWERABLE: ReadonlySet<StoryStickerKind> = new Set([
  'POLL',
  'QUIZ',
  'SLIDER',
  'QUESTION',
]);
export const ONE_ANSWER_PER_PERSON: ReadonlySet<StoryStickerKind> = new Set([
  'POLL',
  'QUIZ',
  'SLIDER',
]);
