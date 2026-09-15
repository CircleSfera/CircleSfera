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
});
