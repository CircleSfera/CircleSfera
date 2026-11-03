import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHOR_ID,
  BUYER_ID,
  expectClosed,
  expectWhole,
  FULL_URL,
  inlinePaidMedia,
  paidPost,
  realPaywall,
  STRANGER_ID,
} from '../common/testing/paid-posts.js';
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
    service = new PlacesService(prisma as never, realPaywall());
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
    // Neither someone else's nor the viewer's own post shows once deleted
    // or removed.
    expect(eligibility.deletedAt).toBeNull();
    expect(whereArg.posts.some.OR[1]).toEqual({
      profileId: 'viewer',
      moderationStatus: { not: 'REMOVED' },
      deletedAt: null,
      archivedAt: null,
    });
  });

  describe('a paid post at a place', () => {
    const OPEN_URL = 'https://open.example/free.jpg';
    const place = {
      id: 'pl-paid',
      mapboxId: 'mb',
      name: 'Plaza',
      fullName: null,
      latitude: 40.4,
      longitude: -3.7,
      country: null,
      region: null,
      locality: null,
    };
    const profile = { id: AUTHOR_ID, username: 'author', avatar: null };
    // The paid post is the latest at the place; an older one is not paid.
    const posts = () => [
      paidPost([{ ...inlinePaidMedia(), thumbnailUrl: `${FULL_URL}.thumb` }], {
        placeId: place.id,
        profile,
      }),
      {
        id: 'free-post',
        profileId: AUTHOR_ID,
        isPremium: false,
        placeId: place.id,
        profile,
        media: [{ url: OPEN_URL, thumbnailUrl: null, standardUrl: null }],
      },
    ];

    const pinFor = async (viewer?: string) => {
      prisma.place.findMany.mockResolvedValueOnce([place]);
      prisma.post.groupBy.mockResolvedValueOnce([
        { placeId: place.id, _count: { _all: 2 } },
      ]);
      prisma.post.findMany.mockResolvedValueOnce(posts());
      const { data } = await service.getMapPins(
        { minLat: 40, maxLat: 41, minLng: -4, maxLng: -3 },
        viewer,
      );
      return data[0];
    };

    it('lends no picture to the map for a viewer who has not unlocked it', async () => {
      for (const viewer of [STRANGER_ID, undefined]) {
        const pin = await pinFor(viewer);
        expect(pin.markerImageUrl).toBe(OPEN_URL);
        expect(pin.previewMedia).toEqual([OPEN_URL]);
        // The pin still leads to the latest post, which opens closed.
        expect(pin.latestPostId).toBe('paid-post');
      }
    });

    it('is the picture of the pin for its author and for someone who unlocked it', async () => {
      for (const viewer of [AUTHOR_ID, BUYER_ID]) {
        const pin = await pinFor(viewer);
        expect(pin.markerImageUrl).toBe(`${FULL_URL}.thumb`);
        expect(pin.previewMedia).toEqual([`${FULL_URL}.thumb`, OPEN_URL]);
      }
    });

    it('has no picture when every post there is closed to the viewer', async () => {
      prisma.place.findMany.mockResolvedValueOnce([place]);
      prisma.post.groupBy.mockResolvedValueOnce([]);
      prisma.post.findMany.mockResolvedValueOnce([posts()[0]]);
      const { data } = await service.getMapPins(
        { minLat: 40, maxLat: 41, minLng: -4, maxLng: -3 },
        STRANGER_ID,
      );
      expect(data[0].markerImageUrl).toBeNull();
      expect(data[0].previewMedia).toEqual([]);
    });

    const listedFor = async (viewer?: string) => {
      prisma.place.findUnique.mockResolvedValueOnce({ id: place.id });
      prisma.post.findMany.mockResolvedValueOnce([
        paidPost([inlinePaidMedia()], { likes: [] }),
      ]);
      prisma.post.count.mockResolvedValueOnce(1);
      const result = await service.getPlacePosts(
        place.id,
        { page: 1, limit: 20 },
        viewer,
      );
      return result.data[0];
    };

    it('is listed closed to a viewer who has not unlocked it', async () => {
      expectClosed(await listedFor(STRANGER_ID));
      expectClosed(await listedFor());
    });

    it('is listed whole for its author and for someone who unlocked it', async () => {
      expectWhole(await listedFor(AUTHOR_ID));
      expectWhole(await listedFor(BUYER_ID));
    });
  });
});
