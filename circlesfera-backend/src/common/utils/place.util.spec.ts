import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { resolvePlaceAttachment } from './place.util.js';

describe('resolvePlaceAttachment', () => {
  it('returns free-text location when no place', async () => {
    const db = { place: { findUnique: vi.fn(), upsert: vi.fn() } };
    await expect(
      resolvePlaceAttachment(db as never, { location: '  Madrid  ' }),
    ).resolves.toEqual({ placeId: null, location: 'Madrid' });
  });

  it('rejects placeId + place together', async () => {
    const db = { place: { findUnique: vi.fn(), upsert: vi.fn() } };
    await expect(
      resolvePlaceAttachment(db as never, {
        placeId: 'p1',
        place: {
          mapboxId: 'mb.1',
          name: 'X',
          latitude: 1,
          longitude: 2,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads an existing placeId', async () => {
    const db = {
      place: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'p1',
          name: 'Madrid',
          fullName: 'Madrid, Spain',
        }),
        upsert: vi.fn(),
      },
    };
    await expect(
      resolvePlaceAttachment(db as never, { placeId: 'p1' }),
    ).resolves.toEqual({ placeId: 'p1', location: 'Madrid, Spain' });
  });

  it('upserts nested place by mapboxId', async () => {
    const db = {
      place: {
        findUnique: vi.fn(),
        upsert: vi.fn().mockResolvedValue({
          id: 'p2',
          name: 'Retiro',
          fullName: 'Parque del Retiro, Madrid',
        }),
      },
    };
    const result = await resolvePlaceAttachment(db as never, {
      place: {
        mapboxId: 'place.retiro',
        name: 'Retiro',
        fullName: 'Parque del Retiro, Madrid',
        latitude: 40.4,
        longitude: -3.68,
      },
    });
    expect(result).toEqual({
      placeId: 'p2',
      location: 'Parque del Retiro, Madrid',
    });
    expect(db.place.upsert).toHaveBeenCalled();
  });

  describe('names per language', () => {
    const place = {
      mapboxId: 'place.es',
      name: 'España',
      latitude: 40.4,
      longitude: -3.7,
    };
    const dbWith = () => ({
      place: {
        findUnique: vi.fn(),
        upsert: vi.fn().mockResolvedValue({
          id: 'p3',
          name: 'España',
          fullName: null,
        }),
      },
      placeTranslation: { upsert: vi.fn().mockResolvedValue({}) },
    });

    it('saves the names of the place in each language it was sent in', async () => {
      const db = dbWith();

      await resolvePlaceAttachment(db as never, {
        place: {
          ...place,
          translations: [
            { locale: 'es', name: ' España ', country: 'España' },
            { locale: 'en', name: 'Spain', fullName: 'Spain, Europe' },
          ],
        },
      });

      expect(db.placeTranslation.upsert).toHaveBeenCalledTimes(2);
      expect(db.placeTranslation.upsert).toHaveBeenCalledWith({
        where: { placeId_locale: { placeId: 'p3', locale: 'es' } },
        create: {
          placeId: 'p3',
          locale: 'es',
          name: 'España',
          fullName: null,
          country: 'España',
          region: null,
          locality: null,
        },
        update: {
          name: 'España',
          fullName: null,
          country: 'España',
          region: null,
          locality: null,
        },
      });
      expect(db.placeTranslation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { placeId_locale: { placeId: 'p3', locale: 'en' } },
          update: expect.objectContaining({
            name: 'Spain',
            fullName: 'Spain, Europe',
          }),
        }),
      );
    });

    it('saves no translation for a place sent without them, as older apps do', async () => {
      const db = dbWith();

      await resolvePlaceAttachment(db as never, { place });

      expect(db.placeTranslation.upsert).not.toHaveBeenCalled();
    });

    it('ignores an unknown language, an empty name and a repeated language', async () => {
      const db = dbWith();

      await resolvePlaceAttachment(db as never, {
        place: {
          ...place,
          translations: [
            { locale: 'fr' as never, name: 'Espagne' },
            { locale: 'en', name: '   ' },
            { locale: 'es', name: 'España' },
            { locale: 'es', name: 'Otra' },
          ],
        },
      });

      expect(db.placeTranslation.upsert).toHaveBeenCalledTimes(1);
      expect(db.placeTranslation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ name: 'España' }),
        }),
      );
    });

    it('keeps the label of the post as the author sent it', async () => {
      const db = dbWith();

      const result = await resolvePlaceAttachment(db as never, {
        location: 'España, Europa',
        place: {
          ...place,
          translations: [{ locale: 'en', name: 'Spain' }],
        },
      });

      expect(result).toEqual({ placeId: 'p3', location: 'España, Europa' });
    });
  });
});
