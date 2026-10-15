import { plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateStoryDto } from '../../stories/dto/create-story.dto.js';
import { RespondStoryStickerDto } from './story-sticker.dto.js';

const sticker = (over: Record<string, unknown> = {}) => ({
  kind: 'POLL',
  settings: { question: 'Q', options: ['a', 'b'] },
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  ...over,
});

/** Every failed rule under `stickers`, as "path: rule". */
const failed = async (stickers: unknown) => {
  const errors = await validate(
    plainToInstance(CreateStoryDto, {
      url: 'https://cdn/x.png',
      stickers,
    }) as object,
    { whitelist: true, forbidNonWhitelisted: true },
  );
  const collect = (list: ValidationError[], path: string): string[] =>
    list.flatMap((e) => {
      const here = path ? `${path}.${e.property}` : e.property;
      return [
        ...Object.keys(e.constraints ?? {}).map((rule) => `${here}: ${rule}`),
        ...collect(e.children ?? [], here),
      ];
    });
  return collect(
    errors.filter((e) => e.property === 'stickers'),
    '',
  );
};

describe('the stickers of a new story', () => {
  it('may be left out, or be up to ten', async () => {
    expect(await failed(undefined)).toEqual([]);
    expect(await failed(Array.from({ length: 10 }, () => sticker()))).toEqual(
      [],
    );
    expect(await failed(Array.from({ length: 11 }, () => sticker()))).toEqual([
      'stickers: arrayMaxSize',
    ]);
  });

  it('each has a known kind, settings and a place within the story', async () => {
    expect(await failed([sticker({ kind: 'GIF' })])).toEqual([
      'stickers.0.kind: isEnum',
    ]);
    expect(await failed([sticker({ settings: 'text' })])).toEqual([
      'stickers.0.settings: isObject',
    ]);
    expect(await failed([sticker({ x: 0.6, rotation: 200 })])).toEqual([
      'stickers.0.x: max',
      'stickers.0.rotation: max',
    ]);
  });
});

describe('an answer to a sticker', () => {
  const rules = async (body: object) =>
    (await validate(plainToInstance(RespondStoryStickerDto, body))).flatMap(
      (e) => Object.keys(e.constraints ?? {}).map((r) => `${e.property}: ${r}`),
    );

  it('is an option, a slider value from 0 to 1, or a text of at most 500 characters', async () => {
    expect(await rules({ optionIndex: 3 })).toEqual([]);
    expect(await rules({ optionIndex: 4 })).toEqual(['optionIndex: max']);
    expect(await rules({ value: 1.1 })).toEqual(['value: max']);
    expect(await rules({ text: 'x'.repeat(501) })).toEqual(['text: maxLength']);
  });
});
