import { type Prisma, Visibility } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LISTED_POST } from './removed-content.policy.js';

// The posts a viewer may find in a public list (a place, a song): public
// posts of public Profiles that moderation left up and their authors did not
// delete or archive, none across a block either way; plus the viewer's own,
// but what moderation removed or they deleted or archived.
export async function publicPostListWhere(
  prisma: Pick<PrismaService, 'block'>,
  viewerId?: string | null,
): Promise<Prisma.PostWhereInput> {
  const base: Prisma.PostWhereInput = {
    visibility: Visibility.PUBLIC,
    moderationStatus: 'VISIBLE',
    deletedAt: null,
    archivedAt: null,
    profile: { privacyLevel: Visibility.PUBLIC },
  };
  if (!viewerId) return base;

  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  const excluded = new Set<string>();
  for (const b of blocks) {
    excluded.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  }
  const others: Prisma.PostWhereInput = {
    ...base,
    ...(excluded.size > 0 ? { profileId: { notIn: [...excluded] } } : {}),
  };
  return { OR: [others, { profileId: viewerId, ...LISTED_POST }] };
}

// A like count the author hid is shown to the author only.
export function withLikeCountAsSeenBy<
  T extends {
    profileId: string;
    hideLikes?: boolean;
    _count?: { likes?: number | null };
  },
>(post: T, viewerId?: string | null): T {
  if (!post.hideLikes || post.profileId === viewerId || !post._count) {
    return post;
  }
  return { ...post, _count: { ...post._count, likes: null } };
}
