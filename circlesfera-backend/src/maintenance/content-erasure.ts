import type { Prisma } from '@prisma/client';
import type { IgnoredRows } from '../uploads/services/media-references.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';

type Files = Array<string | null | undefined>;
type Tx = Prisma.TransactionClient;
type FileDeleter = Pick<UploadsService, 'deleteFilesOfErasedContent'>;

// What erasing a story needs to know of it.
export interface ErasedStory {
  id: string;
  profileId: string;
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  overlayUrl: string | null;
}

export const STORY_FILES = {
  url: true,
  standardUrl: true,
  thumbnailUrl: true,
  overlayUrl: true,
} as const;

export const COMMENT_FILES = {
  profileId: true,
  url: true,
  standardUrl: true,
  thumbnailUrl: true,
  voiceUrl: true,
} as const;

export interface CommentFileColumns {
  profileId: string;
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  voiceUrl: string | null;
}

export function commentFiles(comment: CommentFileColumns): {
  profileId: string;
  files: Files;
} {
  return {
    profileId: comment.profileId,
    files: [
      comment.url,
      comment.standardUrl,
      comment.thumbnailUrl,
      comment.voiceUrl,
    ],
  };
}

/**
 * The files of the rows about to be erased, each as its author's: only the
 * author's own, and only those no other row names, are deleted. A failure is
 * thrown, so the caller keeps the rows and tries again later.
 */
export async function deleteErasedFiles(
  uploads: FileDeleter,
  groups: Array<{ profileId: string; files: Files }>,
  ignoring: IgnoredRows,
): Promise<void> {
  for (const { profileId, files } of groups) {
    if (!files.some(Boolean)) continue;
    await uploads.deleteFilesOfErasedContent(profileId, files, ignoring);
  }
}

/**
 * Erases a post (a frame too) for good, in the transaction that holds its
 * row: its files and its comments' files first, then the row, which takes
 * its comments, likes and the rest with it. A file that cannot be deleted
 * throws, and the post is kept.
 */
export async function erasePost(
  tx: Tx,
  uploads: FileDeleter,
  post: { id: string; profileId: string },
): Promise<void> {
  const media = await tx.postMedia.findMany({
    where: { postId: post.id },
    select: { id: true, url: true, standardUrl: true, thumbnailUrl: true },
  });
  const comments = await tx.comment.findMany({
    where: { postId: post.id },
    select: { id: true, ...COMMENT_FILES },
  });
  await deleteErasedFiles(
    uploads,
    [
      {
        profileId: post.profileId,
        files: media.flatMap((m) => [m.url, m.standardUrl, m.thumbnailUrl]),
      },
      ...comments.map(commentFiles),
    ],
    {
      postMedia: media.map((m) => m.id),
      comment: comments.map((c) => c.id),
    },
  );
  await tx.post.delete({ where: { id: post.id } });
}

/**
 * Erases a story for good, in the transaction that holds its row: its files
 * first, then the row. A file that cannot be deleted throws, and the story
 * is kept.
 */
export async function eraseStory(
  tx: Tx,
  uploads: FileDeleter,
  story: ErasedStory,
): Promise<void> {
  await deleteErasedFiles(
    uploads,
    [
      {
        profileId: story.profileId,
        files: [
          story.url,
          story.standardUrl,
          story.thumbnailUrl,
          story.overlayUrl,
        ],
      },
    ],
    { story: [story.id] },
  );
  await tx.story.delete({ where: { id: story.id } });
}
