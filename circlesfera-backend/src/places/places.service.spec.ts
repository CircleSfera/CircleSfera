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
      {
        id: 'pl2-empty',
        mapboxId: 'mb2',
        name: 'Empty Square',
        fullName: 'Empty Square, Madrid',
        latitude: 40.5,
        longitude: -3.8,
        country: 'ES',
        region: 'Madrid',
        locality: 'Madrid',
      },
      {
        id: 'pl3',
        mapboxId: 'mb3',
        name: 'Plaza 3',
        fullName: 'Plaza 3, Madrid',
        latitude: 40.6,
        longitude: -3.9,
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
      {
        id: 'post-3',
        placeId: 'pl1',
        media: [
          { url: 'https://cdn/c.jpg', thumbnailUrl: null, standardUrl: null },
        ],
        profile: { id: 'c3', username: 'carol', avatar: null },
      },
      {
        id: 'post-4',
        placeId: 'pl1',
        media: [
          { url: 'https://cdn/d.jpg', thumbnailUrl: null, standardUrl: null },
        ],
        profile: { id: 'c4', username: 'dave', avatar: null },
      },
      {
        id: 'post-no-media',
        placeId: 'pl3',
        media: [],
        profile: { id: 'c3', username: 'charlie', avatar: null },
      },
    ]);

    const result = await service.getMapPins(
      { minLat: 40, maxLat: 41, minLng: -4, maxLng: -3 },
      'viewer',
    );

    expect(result.data).toHaveLength(3);
    expect(result.data[0].postCount).toBe(2);
    expect(result.data[0].previewMedia).toEqual([
      'https://cdn/a.jpg',
      'https://cdn/b-t.jpg',
      'https://cdn/c.jpg',
    ]);
    expect(result.data[0].creators).toHaveLength(3);
    expect(result.data[0].latestPostId).toBe('post-1');
    expect(result.data[0].markerImageUrl).toBe('https://cdn/a.jpg');

    expect(result.data[1].id).toBe('pl2-empty');
    expect(result.data[1].postCount).toBe(0);
    expect(result.data[1].markerImageUrl).toBeNull();
    expect(result.data[1].latestPostId).toBeNull();
    expect(prisma.block.findMany).toHaveBeenCalled();
  });

  it('findOne throws when missing', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findOne returns place with post count when found', async () => {
    prisma.place.findUnique.mockResolvedValue({
      id: 'pl-1',
      name: 'Plaza Mayor',
    });
    prisma.post.count.mockResolvedValue(5);

    const result = await service.findOne('pl-1', 'viewer-profile');
    expect(result).toEqual({
      id: 'pl-1',
      name: 'Plaza Mayor',
      postCount: 5,
    });
  });

  it('getPlacePosts throws when place missing', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(
      service.getPlacePosts('missing', { page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getPlacePosts returns paginated posts with cursor and isLiked', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'pl-1' });
    prisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        content: 'Nice place',
        likes: [{ profileId: 'viewer-1' }],
      },
    ]);
    prisma.post.count.mockResolvedValue(1);

    const result = await service.getPlacePosts(
      'pl-1',
      { page: 1, limit: 10, cursor: 'post-prev' },
      'viewer-1',
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].isLiked).toBe(true);
    expect(result.meta.nextCursor).toBe('post-1');
  });

  it('getPlacePosts returns empty paginated list without cursor or viewer', async () => {
    prisma.place.findUnique.mockResolvedValue({ id: 'pl-1' });
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.count.mockResolvedValue(0);

    const result = await service.getPlacePosts('pl-1', { page: 1, limit: 20 });

    expect(result.data).toHaveLength(0);
    expect(result.meta.nextCursor).toBeUndefined();
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
