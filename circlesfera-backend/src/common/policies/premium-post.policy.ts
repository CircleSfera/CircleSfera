import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Whether a paid post is still closed to a viewer: it is paid, the viewer is
 * not its author, and the person behind the viewer has not unlocked it. A
 * closed post shows no picture and no sticker, and its stickers take no
 * answer.
 */
export async function isPremiumPostLocked(
  prisma: Pick<PrismaService, 'profile' | 'postUnlock'>,
  post: { id: string; isPremium: boolean; profileId: string },
  viewerProfileId: string | null | undefined,
): Promise<boolean> {
  if (!post.isPremium) return false;
  if (!viewerProfileId) return true;
  if (viewerProfileId === post.profileId) return false;
  const viewer = await prisma.profile.findUnique({
    where: { id: viewerProfileId },
    select: { userId: true },
  });
  if (!viewer) return true;
  const unlock = await prisma.postUnlock.findUnique({
    where: { userId_postId: { userId: viewer.userId, postId: post.id } },
    select: { id: true },
  });
  return unlock === null;
}
