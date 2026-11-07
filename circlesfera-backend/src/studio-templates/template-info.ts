import type { Prisma } from '@prisma/client';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';

type BlockReader = Pick<Prisma.TransactionClient, 'block' | 'profile' | 'user'>;

/** What a post read brings of the templates it is linked to. */
export const TEMPLATE_INCLUDE = {
  studioTemplate: { select: { id: true, uses: true, isPublic: true } },
  madeWithTemplate: {
    select: {
      isPublic: true,
      postId: true,
      profile: { select: { id: true, username: true } },
    },
  },
} satisfies Prisma.PostInclude;

interface WithTemplates {
  profileId: string;
  studioTemplate?: { id: string; uses: number; isPublic: boolean } | null;
  madeWithTemplate?: {
    isPublic: boolean;
    postId: string | null;
    profile: { id: string; username: string };
  } | null;
}

/** A Frame's template, as the post shows it. */
export interface TemplateOffer {
  id: string;
  uses: number;
  /** Shown to the author only, who can turn it on and off. */
  isPublic?: boolean;
}

/** The credit of a post made with someone's template. */
export interface TemplateCredit {
  postId: string;
  username: string;
}

/**
 * Posts with their templates as the viewer may see them: a Frame's template
 * when it is offered (its author sees theirs either way), and the credit of
 * the template a post was made with, while that template is offered and
 * its author and the viewer have not blocked each other.
 */
export async function withTemplateInfo<P extends WithTemplates>(
  db: BlockReader,
  posts: P[],
  viewerProfileId?: string | null,
): Promise<
  (Omit<P, 'studioTemplate' | 'madeWithTemplate'> & {
    studioTemplate: TemplateOffer | null;
    madeWithTemplate: TemplateCredit | null;
  })[]
> {
  const authors = [
    ...new Set(
      posts.flatMap((p) =>
        p.madeWithTemplate?.isPublic && p.madeWithTemplate.postId
          ? [p.madeWithTemplate.profile.id]
          : [],
      ),
    ),
  ];
  const blocked = new Set<string>();
  for (const author of authors) {
    if (await isBlockedEitherWay(db, viewerProfileId, author))
      blocked.add(author);
  }
  return posts.map(({ studioTemplate, madeWithTemplate, ...post }) => {
    const own = viewerProfileId === post.profileId;
    const offer =
      studioTemplate && (studioTemplate.isPublic || own)
        ? {
            id: studioTemplate.id,
            uses: studioTemplate.uses,
            ...(own ? { isPublic: studioTemplate.isPublic } : {}),
          }
        : null;
    const credit =
      madeWithTemplate?.isPublic &&
      madeWithTemplate.postId &&
      !blocked.has(madeWithTemplate.profile.id)
        ? {
            postId: madeWithTemplate.postId,
            username: madeWithTemplate.profile.username,
          }
        : null;
    return { ...post, studioTemplate: offer, madeWithTemplate: credit };
  });
}
