import type {
  ContentRating,
  ModerationStatus,
  Post,
  PostMedia,
  PostType,
  Prisma,
  PrismaClient,
  Visibility,
} from '@prisma/client';
import { generateTestSuffix } from './user.factory.js';

export interface PostMediaItemOverride {
  url?: string;
  type?: 'image' | 'video';
  order?: number;
  altText?: string;
}

export interface PostFactoryOverrides {
  caption?: string;
  type?: PostType;
  visibility?: Visibility;
  contentRating?: ContentRating;
  moderationStatus?: ModerationStatus;
  isPremium?: boolean;
  priceCents?: number;
  media?: PostMediaItemOverride[];
  hashtags?: string[];
}

/**
 * Build unpersisted Post attributes.
 */
export function buildPostAttributes(
  profileId: string,
  overrides: PostFactoryOverrides = {},
): Prisma.PostUncheckedCreateInput {
  const suffix = generateTestSuffix();
  return {
    profileId,
    caption: overrides.caption ?? `Deterministic test post caption #${suffix}`,
    type: overrides.type ?? 'POST',
    visibility: overrides.visibility ?? 'PUBLIC',
    contentRating: overrides.contentRating ?? 'GENERAL',
    moderationStatus: overrides.moderationStatus ?? 'VISIBLE',
    isPremium: overrides.isPremium ?? false,
    priceCents: overrides.priceCents ?? 0,
  };
}

/**
 * Create and persist a Post with optional media and hashtags.
 */
export async function createPost(
  prisma: PrismaClient,
  profileId: string,
  overrides: PostFactoryOverrides = {},
): Promise<Post & { media: PostMedia[] }> {
  const data = buildPostAttributes(profileId, overrides);

  const mediaItems = overrides.media ?? [
    {
      url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      type: 'image',
      order: 0,
      altText: 'Sample post media image',
    },
  ];

  const post = await prisma.post.create({
    data: {
      ...data,
      media: {
        create: mediaItems.map((m, idx) => ({
          url:
            m.url ?? 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          type: m.type ?? 'image',
          order: m.order ?? idx,
          altText: m.altText ?? 'Media item',
        })),
      },
    },
    include: {
      media: true,
    },
  });

  if (overrides.hashtags && overrides.hashtags.length > 0) {
    for (const tag of overrides.hashtags) {
      const cleanTag = tag.replace(/^#/, '').toLowerCase();
      const hashtag = await prisma.hashtag.upsert({
        where: { tag: cleanTag },
        create: { tag: cleanTag, postCount: 1 },
        update: { postCount: { increment: 1 } },
      });
      await prisma.postHashtag.create({
        data: {
          postId: post.id,
          hashtagId: hashtag.id,
        },
      });
    }
  }

  return post;
}
