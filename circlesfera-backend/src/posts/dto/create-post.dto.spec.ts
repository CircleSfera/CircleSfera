import { POST_SHAPES } from '@circlesfera/shared';
import { plainToInstance } from 'class-transformer';
import { type ValidationError, validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateStoryDto } from '../../stories/dto/create-story.dto.js';
import { POST_STICKER_MAX } from '../../story-stickers/story-sticker-settings.js';
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
  const errors = await validate(
    plainToInstance(dto as typeof CreatePostDto, body) as object,
    {
      whitelist: true,
      forbidNonWhitelisted: true,
    },
  );
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

describe('the moment of the cover of a frame', () => {
  const rules = async (
    dto: typeof CreatePostDto | typeof UpdatePostDto,
    coverTimeMs: unknown,
  ) => {
    const errors = await validate(
      plainToInstance(dto, { coverTimeMs }) as object,
    );
    return Object.keys(
      errors.find((error) => error.property === 'coverTimeMs')?.constraints ??
        {},
    ).sort();
  };

  it.each([
    ['creating', CreatePostDto],
    ['editing', UpdatePostDto],
  ])(
    'is a whole number of milliseconds within the longest frame, when %s',
    async (_when, dto) => {
      expect(await rules(dto, 0)).toEqual([]);
      expect(await rules(dto, 90_000)).toEqual([]);
      expect(await rules(dto, 90_001)).toEqual(['max']);
      expect(await rules(dto, -1)).toEqual(['min']);
      expect(await rules(dto, 1.5)).toEqual(['isInt']);
      expect(await rules(dto, '1000')).toContain('isInt');
    },
  );

  it('can be left out', async () => {
    expect(await rules(UpdatePostDto, undefined)).toEqual([]);
  });
});

describe('the number of photos and videos of a post', () => {
  const rules = async (count: number) => {
    const media = Array.from({ length: count }, (_, i) => ({
      url: `https://cdn/${i}.jpg`,
      type: 'image',
    }));
    const errors = await validate(
      plainToInstance(CreatePostDto, { media }) as object,
    );
    return Object.keys(
      errors.find((error) => error.property === 'media')?.constraints ?? {},
    );
  };

  it('is at most twenty', async () => {
    expect(await rules(20)).toEqual([]);
    expect(await rules(21)).toEqual(['arrayMaxSize']);
  });
});

describe('the stickers on a photo of a post', () => {
  const poll = {
    kind: 'POLL',
    settings: { question: '¿Playa?', options: ['Sí', 'No'] },
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  };
  // Every failed rule under the first photo, as "path: rule".
  const rules = async (stickers: unknown) => {
    const errors = await validate(
      plainToInstance(CreatePostDto, {
        media: [{ url: '/uploads/a.jpg', type: 'image', stickers }],
      }) as object,
      { whitelist: true, forbidNonWhitelisted: true },
    );
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
    return collect(errors, '');
  };

  it('are left out, or each a sticker as a story takes it', async () => {
    expect(await rules(undefined)).toEqual([]);
    expect(await rules([poll])).toEqual([]);
  });

  it('are as many as a post holds, and no more', async () => {
    expect(await rules(Array(POST_STICKER_MAX).fill(poll))).toEqual([]);
    expect(await rules(Array(POST_STICKER_MAX + 1).fill(poll))).toEqual([
      'media.0.stickers: arrayMaxSize',
    ]);
  });

  it('refuse an unknown kind and a place off the photo', async () => {
    expect(
      await rules([
        { ...poll, kind: 'SPARKLE' },
        { ...poll, x: 0.9 },
      ]),
    ).toEqual(['media.0.stickers.0.kind: isEnum', 'media.0.stickers.1.x: max']);
  });
});

describe('the shape of a post', () => {
  const rules = async (shape: unknown) => {
    const errors = await validate(
      plainToInstance(CreatePostDto, { shape }) as object,
    );
    return Object.keys(
      errors.find((error) => error.property === 'shape')?.constraints ?? {},
    );
  };

  it('is one of the shapes, or left out', async () => {
    for (const shape of POST_SHAPES) expect(await rules(shape)).toEqual([]);
    expect(await rules(undefined)).toEqual([]);
  });

  it('is no other value', async () => {
    expect(await rules('CIRCLE')).toEqual(['isIn']);
  });
});
