import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreatePollDto } from './create-poll.dto.js';
import { CreateQnaBoxDto } from './create-qna.dto.js';

const placement = (over: Record<string, unknown> = {}) => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  ...over,
});

/** The rules of `placement` that fail, as "field: rule". */
const failed = async (
  dto: typeof CreatePollDto | typeof CreateQnaBoxDto,
  value: unknown,
) => {
  const body =
    dto === CreatePollDto
      ? { question: 'Q?', options: ['A', 'B'], placement: value }
      : { prompt: 'Ask', placement: value };
  const errors = await validate(
    plainToInstance(dto as typeof CreatePollDto, body) as object,
    {
      whitelist: true,
      forbidNonWhitelisted: true,
    },
  );
  const error = errors.find((e) => e.property === 'placement');
  return [
    ...Object.keys(error?.constraints ?? {}),
    ...(error?.children ?? []).flatMap((child) =>
      Object.keys(child.constraints ?? {}).map(
        (rule) => `${child.property}: ${rule}`,
      ),
    ),
  ].sort();
};

describe.each([
  ['poll', CreatePollDto],
  ['question', CreateQnaBoxDto],
] as const)('the place of a %s on a story', (_name, dto) => {
  it('can be left out', async () => {
    expect(await failed(dto, undefined)).toEqual([]);
  });

  it('accepts the edges of each range', async () => {
    expect(
      await failed(dto, { x: -0.5, y: 0.5, scale: 0.5, rotation: -180 }),
    ).toEqual([]);
    expect(
      await failed(dto, { x: 0.5, y: -0.5, scale: 1.35, rotation: 180 }),
    ).toEqual([]);
  });

  it('refuses a centre outside the story, a size out of range and a turn past half', async () => {
    expect(await failed(dto, placement({ x: 0.51 }))).toEqual(['x: max']);
    expect(await failed(dto, placement({ y: -0.51 }))).toEqual(['y: min']);
    expect(await failed(dto, placement({ scale: 2 }))).toEqual(['scale: max']);
    expect(await failed(dto, placement({ rotation: 181 }))).toEqual([
      'rotation: max',
    ]);
  });

  it('refuses a missing or unknown field', async () => {
    expect(await failed(dto, { x: 0, y: 0, scale: 1 })).toContain(
      'rotation: isNumber',
    );
    expect(await failed(dto, placement({ z: 1 }))).toContain(
      'z: whitelistValidation',
    );
  });
});
