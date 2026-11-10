import { ErrorCode, FAVORITES_MAX } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';

// A Profile's Favorites: up to FAVORITES_MAX Profiles it follows, whose posts
// make its Favorites feed. The list is private: nobody is told and nobody
// else sees it. It changes the order of no other feed.
@Injectable()
export class FavoritesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // The Profile's Favorites, the latest added first.
  async list(profileId: string) {
    const rows = await this.prisma.favoriteProfile.findMany({
      where: { profileId },
      orderBy: [{ createdAt: 'desc' }, { favoriteId: 'asc' }],
      select: { createdAt: true, favorite: { select: PUBLIC_PROFILE_SELECT } },
    });
    return rows.map((row) => ({ ...row.favorite, addedAt: row.createdAt }));
  }

  // Add a Profile it follows. Adding one already there changes nothing.
  async add(profileId: string, favoriteId: string) {
    if (profileId === favoriteId) {
      throw AppException.BadRequest(
        ErrorCode.FAVORITE_NOT_FOLLOWED,
        'Only a Profile you follow can be a Favorite',
      );
    }
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: profileId,
          followingId: favoriteId,
        },
      },
      select: { status: true },
    });
    if (follow?.status !== 'ACCEPTED') {
      throw AppException.BadRequest(
        ErrorCode.FAVORITE_NOT_FOLLOWED,
        'Only a Profile you follow can be a Favorite',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.favoriteProfile.findUnique({
        where: { profileId_favoriteId: { profileId, favoriteId } },
        select: { profileId: true },
      });
      if (existing) return { favoriteId, isFavorite: true };

      // The Profile is locked so two adds at once cannot pass the limit.
      await tx.$queryRaw`SELECT id FROM "profiles" WHERE id = ${profileId} FOR UPDATE`;
      const count = await tx.favoriteProfile.count({ where: { profileId } });
      if (count >= FAVORITES_MAX) {
        throw AppException.Conflict(
          ErrorCode.FAVORITES_FULL,
          `A Profile keeps at most ${FAVORITES_MAX} Favorites`,
        );
      }
      await tx.favoriteProfile.create({ data: { profileId, favoriteId } });
      return { favoriteId, isFavorite: true };
    });
  }

  // Remove one. Removing one not there changes nothing.
  async remove(profileId: string, favoriteId: string) {
    await this.prisma.favoriteProfile.deleteMany({
      where: { profileId, favoriteId },
    });
    return { favoriteId, isFavorite: false };
  }
}
