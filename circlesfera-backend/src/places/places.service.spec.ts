import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacesService } from './places.service.js';

describe('PlacesService', () => {
  const prisma = {
    place: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    post: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
  };

  let service: PlacesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PlacesService(prisma as never);
    prisma.block.findMany.mockResolvedValue([]);
  });

  it('getMapPins returns empty when no places in bbox', async () => {
    prisma.place.findMany.mockResolvedValue([]);

    const result = await service.getMapPins({
      minLat: 40,
      maxLat: 41,
      minLng: -4,
      maxLng: -3,
    });

    expect(result).toEqual({ data: [] });
    expect(prisma.post.groupBy).not.toHaveBeenCalled();
  });

  it('getMapPins aggregates counts, previews and creators', async () => {
    prisma.place.findMany.mockResolvedValue([
      {
        id: 'pl1',
        mapboxId: 'mb1',
        name: 'Park',
        fullName: 'Park, Madrid',
        latitude: 40.4,
        longitude: -3.7,
        country: 'ES',
        region: 'Madrid',
        locality: 'Madrid',
      },
    ]);
    prisma.post.groupBy.mockResolvedValue([
      { placeId: 'pl1', _count: { _all: 2 } },
    ]);
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        placeId: 'pl1',
        media: [
          { url: 'https://cdn/a.jpg', thumbnailUrl: null, standardUrl: null },
        ],
        profile: { id: 'c1', username: 'alice', avatar: null },
      },
      {
        id: 'post-2',
        placeId: 'pl1',
        media: [
          {
            url: 'https://cdn/b.jpg',
            thumbnailUrl: 'https://cdn/b-t.jpg',
            standardUrl: null,
          },
        ],
        profile: { id: 'c2', username: 'bob', avatar: 'https://cdn/bob.jpg' },
      },
    ]);

    const result = await service.getMapPins(
      { minLat: 40, maxLat: 41, minLng: -4, maxLng: -3 },
      'viewer',
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].postCount).toBe(2);
    expect(result.data[0].previewMedia).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b-t.jpg',
    ]);
    expect(result.data[0].creators).toHaveLength(2);
    expect(result.data[0].latestPostId).toBe('post-1');
    expect(result.data[0].markerImageUrl).toBe('https://cdn/a.jpg');
    expect(prisma.block.findMany).toHaveBeenCalled();
  });

  it('findOne throws when missing', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getPlacePosts throws when place missing', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(
      service.getPlacePosts('missing', { page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excludes mutual blocks from eligible posts', async () => {
    prisma.block.findMany.mockResolvedValue([
      { blockerId: 'viewer', blockedId: 'blocked-user' },
      { blockerId: 'blocked-me', blockedId: 'viewer' },
    ]);
    prisma.place.findMany.mockResolvedValue([]);

    await service.getMapPins(
      { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 },
      'viewer',
    );

    const whereArg = prisma.place.findMany.mock.calls[0][0].where;
    expect(whereArg.posts.some.OR).toBeDefined();
    const eligibility = whereArg.posts.some.OR[0];
    expect(eligibility.profileId.notIn).toEqual(
      expect.arrayContaining(['blocked-user', 'blocked-me']),
    );
  });
});
