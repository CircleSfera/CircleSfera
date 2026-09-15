import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, Visibility } from '@prisma/client';
import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MapBboxDto } from './dto/map-bbox.dto.js';

const MAP_LIMIT_DEFAULT = 50;
const PREVIEW_MEDIA = 3;
const PREVIEW_CREATORS = 3;

export type PlaceMapCreator = {
  id: string;
  username: string;
  avatar: string | null;
};

export type PlaceMapPin = {
  id: string;
  mapboxId: string;
  name: string;
  fullName: string | null;
  latitude: number;
  longitude: number;
  country: string | null;
  region: string | null;
  locality: string | null;
  postCount: number;
  previewMedia: string[];
  creators: PlaceMapCreator[];
  latestPostId: string | null;
  markerImageUrl: string | null;
};

@Injectable()
export class PlacesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getMapPins(
    bbox: MapBboxDto,
    currentProfileId?: string | null,
  ): Promise<{ data: PlaceMapPin[] }> {
    const minLat = Math.min(bbox.minLat, bbox.maxLat);
    const maxLat = Math.max(bbox.minLat, bbox.maxLat);
    const minLng = Math.min(bbox.minLng, bbox.maxLng);
    const maxLng = Math.max(bbox.minLng, bbox.maxLng);
    const limit = Math.min(bbox.limit ?? MAP_LIMIT_DEFAULT, MAP_LIMIT_DEFAULT);

    const postFilter = await this.buildEligiblePostFilter(currentProfileId);

    const places = await this.prisma.place.findMany({
      where: {
        latitude: { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
        posts: { some: postFilter },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    if (places.length === 0) {
      return { data: [] };
    }

    const placeIds = places.map((p) => p.id);

    const [counts, recentPosts] = await Promise.all([
      this.prisma.post.groupBy({
        by: ['placeId'],
        where: {
          placeId: { in: placeIds },
          ...postFilter,
        },
        _count: { _all: true },
      }),
      this.prisma.post.findMany({
        where: {
          placeId: { in: placeIds },
          ...postFilter,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          media: {
            orderBy: { order: 'asc' },
            take: 1,
            select: {
              url: true,
              thumbnailUrl: true,
              standardUrl: true,
            },
          },
          profile: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      }),
    ]);

    const countByPlace = new Map(
      counts
        .filter((c) => c.placeId)
        .map((c) => [c.placeId as string, c._count._all]),
    );

    const postsByPlace = new Map<string, typeof recentPosts>();
    for (const post of recentPosts) {
      if (!post.placeId) continue;
      const list = postsByPlace.get(post.placeId) ?? [];
      list.push(post);
      postsByPlace.set(post.placeId, list);
    }

    const data: PlaceMapPin[] = places.map((place) => {
      const posts = postsByPlace.get(place.id) ?? [];
      const previewMedia: string[] = [];
      const creators: PlaceMapCreator[] = [];
      const seenCreators = new Set<string>();

      for (const post of posts) {
        if (previewMedia.length < PREVIEW_MEDIA) {
          const m = post.media[0];
          const url = m?.thumbnailUrl || m?.standardUrl || m?.url;
          if (url && !previewMedia.includes(url)) {
            previewMedia.push(url);
          }
        }
        if (
          creators.length < PREVIEW_CREATORS &&
          !seenCreators.has(post.profile.id)
        ) {
          seenCreators.add(post.profile.id);
          creators.push({
            id: post.profile.id,
            username: post.profile.username,
            avatar: post.profile.avatar,
          });
        }
        if (
          previewMedia.length >= PREVIEW_MEDIA &&
          creators.length >= PREVIEW_CREATORS
        ) {
          break;
        }
      }

      const latest = posts[0];
      const markerMedia = latest?.media[0];
      const markerImageUrl =
        markerMedia?.thumbnailUrl ||
        markerMedia?.standardUrl ||
        markerMedia?.url ||
        null;

      return {
        id: place.id,
        mapboxId: place.mapboxId,
        name: place.name,
        fullName: place.fullName,
        latitude: place.latitude,
        longitude: place.longitude,
        country: place.country,
        region: place.region,
        locality: place.locality,
        postCount: countByPlace.get(place.id) ?? posts.length,
        previewMedia,
        creators,
        latestPostId: latest?.id ?? null,
        markerImageUrl,
      };
    });

    return { data };
  }

  async findOne(id: string, currentProfileId?: string | null) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) {
      throw new NotFoundException('Place not found');
    }

    const postFilter = await this.buildEligiblePostFilter(currentProfileId);
    const postCount = await this.prisma.post.count({
      where: { placeId: id, ...postFilter },
    });

    return {
      ...place,
      postCount,
    };
  }

  async getPlacePosts(
    placeId: string,
    pagination: PaginationDto,
    currentProfileId?: string | null,
  ) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) {
      throw new NotFoundException('Place not found');
    }

    const { page = 1, limit = 20, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;
    const postFilter = await this.buildEligiblePostFilter(currentProfileId);

    const where: Prisma.PostWhereInput = {
      placeId,
      ...postFilter,
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            select: {
              id: true,
              username: true,
              avatar: true,
              fullName: true,
            },
          },
          media: {
            orderBy: { order: 'asc' },
          },
          audio: true,
          place: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentProfileId
            ? { where: { profileId: currentProfileId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    const data = posts.map((post) => {
      const { likes, ...rest } = post;
      return {
        ...rest,
        isLiked:
          currentProfileId && Array.isArray(likes) ? likes.length > 0 : false,
      };
    });

    return createPaginatedResult(
      data,
      total,
      page,
      limit,
      data.length > 0 ? data[data.length - 1].id : undefined,
    );
  }

  private async buildEligiblePostFilter(
    currentProfileId?: string | null,
  ): Promise<Prisma.PostWhereInput> {
    const base: Prisma.PostWhereInput = {
      visibility: Visibility.PUBLIC,
      moderationStatus: 'VISIBLE',
      profile: {
        user: { settings: { is: { privacyLevel: Visibility.PUBLIC } } },
      },
    };

    if (!currentProfileId) {
      return base;
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [{ blockerId: currentProfileId }, { blockedId: currentProfileId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const excluded = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === currentProfileId) excluded.add(b.blockedId);
      if (b.blockedId === currentProfileId) excluded.add(b.blockerId);
    }

    const filter: Prisma.PostWhereInput = {
      ...base,
      ...(excluded.size > 0 ? { profileId: { notIn: [...excluded] } } : {}),
    };

    return {
      OR: [filter, { profileId: currentProfileId }],
    };
  }
}
