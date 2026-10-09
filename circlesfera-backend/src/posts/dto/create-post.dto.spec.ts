import { plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateStoryDto } from '../../stories/dto/create-story.dto.js';
import { CreatePostDto } from './create-post.dto.js';
import { UpdatePostDto } from './update-post.dto.js';

const place = (translations?: unknown) => ({
  mapboxId: 'place.es',
  name: 'España',
  latitude: 40.4,
  longitude: -3.7,
  ...(translations === undefined ? {} : { translations }),
});

// Every failed rule under `place`, as "path: rule". Other required fields of
// the request are left out on purpose and ignored here.
const failedFields = async (
  dto: typeof CreatePostDto | typeof CreateStoryDto,
  body: object,
) => {
  const errors = await validate(plainToInstance(dto, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const collect = (list: ValidationError[], path: string): string[] =>
    list.flatMap((error) => {
      const here = path ? `${path}.${error.property}` : error.property;
      return [
        ...Object.keys(error.constraints ?? {}).map(
          (rule) => `${here}: ${rule}`,
        ),
        ...collect(error.children ?? [], here),
      ];
    });
  return collect(
    errors.filter((error) => error.property === 'place'),
    '',
  ).join(' | ');
};

describe.each([
  ['post', CreatePostDto],
  ['story', CreateStoryDto],
] as const)('place names per language on a %s', (_name, dto) => {
  it('accepts a place without translations, as older apps send it', async () => {
    expect(await failedFields(dto, { place: place() })).toBe('');
  });

  it('accepts the names in English and Spanish', async () => {
    const errors = await failedFields(dto, {
      place: place([
        { locale: 'es', name: 'España', country: 'España' },
        { locale: 'en', name: 'Spain', fullName: 'Spain, Europe' },
      ]),
    });

    expect(errors).toBe('');
  });

  it('rejects a language the app does not have', async () => {
    expect(
      await failedFields(dto, {
        place: place([{ locale: 'fr', name: 'Espagne' }]),
      }),
    ).toContain('isIn');
  });

  it('rejects a translation without a name, and a name that is too long', async () => {
    expect(
      await failedFields(dto, { place: place([{ locale: 'en', name: '' }]) }),
    ).toContain('isNotEmpty');
    expect(
      await failedFields(dto, {
        place: place([{ locale: 'en', name: 'x'.repeat(201) }]),
      }),
    ).toContain('maxLength');
  });

  it('rejects more entries than the app has languages', async () => {
    expect(
      await failedFields(dto, {
        place: place([
          { locale: 'en', name: 'Spain' },
          { locale: 'es', name: 'España' },
          { locale: 'en', name: 'Spain again' },
        ]),
      }),
    ).toContain('arrayMaxSize');
  });

  it('rejects a field that is not part of a translation', async () => {
    expect(
      await failedFields(dto, {
        place: place([{ locale: 'en', name: 'Spain', latitude: 1 }]),
      }),
    ).toContain('whitelistValidation');
  });
});

describe('the caption of a post', () => {
  const captionRules = async (
    dto: typeof CreatePostDto | typeof UpdatePostDto,
    caption: string,
  ) => {
    const errors = await validate(plainToInstance(dto, { caption }) as object);
    return Object.keys(
      errors.find((error) => error.property === 'caption')?.constraints ?? {},
    );
  };

  it.each([
    ['creating', CreatePostDto],
    ['editing', UpdatePostDto],
  ])('is accepted at 2200 characters when %s', async (_when, dto) => {
    expect(await captionRules(dto, 'a'.repeat(2200))).toEqual([]);
  });

  it.each([
    ['creating', CreatePostDto],
    ['editing', UpdatePostDto],
  ])('is refused over 2200 characters when %s', async (_when, dto) => {
    expect(await captionRules(dto, 'a'.repeat(2201))).toEqual(['maxLength']);
  });

  it('can be left out or emptied', async () => {
    expect(await captionRules(UpdatePostDto, '')).toEqual([]);
    const errors = await validate(plainToInstance(UpdatePostDto, {}) as object);
    expect(errors).toEqual([]);
  });
});
