import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { PostTagStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { getBlockedProfileIds } from '../common/policies/block.policy.js';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';

// The most tags listed at once.
const TAGS_PAGE = 100;

// The active Profile's tags on others' posts: the ones waiting for its
// approval and the ones shown on its profile. It approves a waiting one, or
// takes itself off any post. The post's author is never told.
@Injectable()
export class PostTagsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(profileId: string, status: PostTagStatus) {
    const blocked = await getBlockedProfileIds(this.prisma, profileId);
    const rows = await this.prisma.postTag.findMany({
      where: {
        profileId,
        status,
        post: {
          ...LISTED_POST,
          ...(blocked.length > 0 && { profileId: { notIn: blocked } }),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: TAGS_PAGE,
      select: {
        createdAt: true,
        status: true,
        post: {
          select: {
            id: true,
            caption: true,
            isPremium: true,
            createdAt: true,
            profile: { select: PUBLIC_PROFILE_SELECT },
            media: {
              orderBy: { order: 'asc' },
              take: 1,
              select: { thumbnailUrl: true, url: true, type: true },
            },
          },
        },
      },
    });
    // A paid post shows no picture here: the tag is not a way into it.
    return {
      data: rows.map(({ post, ...tag }) => {
        const { media, isPremium, ...rest } = post;
        const first = media[0];
        return {
          ...tag,
          post: {
            ...rest,
            thumbnailUrl: isPremium
              ? null
              : (first?.thumbnailUrl ??
                (first?.type === 'image' ? first.url : null)),
          },
        };
      }),
    };
  }

  // Shows on the Profile a tag that was waiting for its approval.
  async approve(postId: string, profileId: string) {
    const { count } = await this.prisma.postTag.updateMany({
      where: { postId, profileId, status: 'PENDING' },
      data: { status: 'SHOWN' },
    });
    if (count === 0) this.notFound();
    return { postId, status: 'SHOWN' as const };
  }

  // Takes the Profile off a post's tags, waiting or shown.
  async remove(postId: string, profileId: string) {
    const { count } = await this.prisma.postTag.deleteMany({
      where: { postId, profileId },
    });
    if (count === 0) this.notFound();
    return { postId, removed: true };
  }

  private notFound(): never {
    throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Tag not found');
  }
}
