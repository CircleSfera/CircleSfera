import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

export type PlaceInput = {
  mapboxId: string;
  name: string;
  fullName?: string;
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  locality?: string;
};

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Resolve placeId for create: existing UUID, or upsert by Mapbox feature id.
 * Also returns the denormalized location label to store on Post/Story.
 */
export async function resolvePlaceAttachment(
  db: Db,
  options: {
    placeId?: string | null;
    place?: PlaceInput | null;
    location?: string | null;
  },
): Promise<{ placeId: string | null; location: string | null }> {
  if (options.placeId && options.place) {
    throw new BadRequestException('PLACE_AND_PLACE_ID_MUTUALLY_EXCLUSIVE');
  }

  if (options.placeId) {
    const existing = await db.place.findUnique({
      where: { id: options.placeId },
      select: { id: true, name: true, fullName: true },
    });
    if (!existing) {
      throw new BadRequestException('PLACE_NOT_FOUND');
    }
    return {
      placeId: existing.id,
      location:
        options.location?.trim() || existing.fullName || existing.name || null,
    };
  }

  if (options.place) {
    const input = options.place;
    if (
      !input.mapboxId?.trim() ||
      !input.name?.trim() ||
      !Number.isFinite(input.latitude) ||
      !Number.isFinite(input.longitude)
    ) {
      throw new BadRequestException('PLACE_INPUT_INVALID');
    }

    const upserted = await db.place.upsert({
      where: { mapboxId: input.mapboxId.trim() },
      create: {
        mapboxId: input.mapboxId.trim(),
        name: input.name.trim(),
        fullName: input.fullName?.trim() || null,
        latitude: input.latitude,
        longitude: input.longitude,
        country: input.country?.trim() || null,
        region: input.region?.trim() || null,
        locality: input.locality?.trim() || null,
      },
      update: {
        name: input.name.trim(),
        fullName: input.fullName?.trim() || null,
        latitude: input.latitude,
        longitude: input.longitude,
        country: input.country?.trim() || null,
        region: input.region?.trim() || null,
        locality: input.locality?.trim() || null,
      },
      select: { id: true, name: true, fullName: true },
    });

    return {
      placeId: upserted.id,
      location:
        options.location?.trim() || upserted.fullName || upserted.name || null,
    };
  }

  return {
    placeId: null,
    location: options.location?.trim() || null,
  };
}
