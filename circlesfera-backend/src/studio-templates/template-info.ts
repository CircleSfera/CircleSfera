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
      // The Frame the credit links to, to credit only one anyone can open.
      post: {
        select: {
          deletedAt: true,
          archivedAt: true,
          moderationStatus: true,
          visibility: true,
          profile: { select: { privacyLevel: true } },
        },
      },
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
    post?: {
      deletedAt: Date | null;
      archivedAt: Date | null;
      moderationStatus: string;
      visibility: string;
      profile: { privacyLevel: string } | null;
    } | null;
  } | null;
  templateId?: string | null;
}

/** Whether the Frame a credit links to can be opened by anyone. */
function openToAll(
  source: NonNullable<WithTemplates['madeWithTemplate']>,
): boolean {
  const frame = source.post;
  return Boolean(
    source.isPublic &&
      source.postId &&
      frame &&
      !frame.deletedAt &&
      !frame.archivedAt &&
      frame.moderationStatus === 'VISIBLE' &&
      frame.visibility === 'PUBLIC' &&
      frame.profile?.privacyLevel !== 'PRIVATE',
  );
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
  (Omit<P, 'studioTemplate' | 'madeWithTemplate' | 'templateId'> & {
    studioTemplate: TemplateOffer | null;
    madeWithTemplate: TemplateCredit | null;
  })[]
> {
  const authors = [
    ...new Set(
      posts.flatMap((p) =>
        p.madeWithTemplate && openToAll(p.madeWithTemplate)
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
  // The template a post was made with shows only as its credit.
  return posts.map(
    ({ studioTemplate, madeWithTemplate, templateId: _id, ...post }) => {
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
        madeWithTemplate &&
        openToAll(madeWithTemplate) &&
        !blocked.has(madeWithTemplate.profile.id)
          ? {
              postId: madeWithTemplate.postId as string,
              username: madeWithTemplate.profile.username,
            }
          : null;
      return { ...post, studioTemplate: offer, madeWithTemplate: credit };
    },
  );
}
