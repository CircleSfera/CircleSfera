import type {
  Comment as SharedComment,
  Post as SharedPost,
  Profile as SharedProfile,
  Story as SharedStory,
} from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';

/**
 * This file serves as a static type checker to ensure that the manually written
 * interfaces in `circlesfera-shared` remain compatible with the actual payloads
 * returned by Prisma.
 *
 * If a database migration alters a field (e.g. renaming `caption` to `text`),
 * this file will fail to compile (`npm run build`), alerting developers to update
 * the shared models.
 */

// 1. Post Type Check
type ExpectedPostPayload = Prisma.PostGetPayload<{
  include: {
    user: {
      include: { profile: true };
    };
    media: true;
    _count: { select: { likes: true; comments: true } };
  };
}>;
export const _checkPost: SharedPost = {} as unknown as ExpectedPostPayload;

// 2. Profile Type Check
type ExpectedProfilePayload =
  Prisma.ProfileGetPayload<Prisma.ProfileDefaultArgs>;
export const _checkProfile: SharedProfile =
  {} as unknown as ExpectedProfilePayload;

// 3. Story Type Check
type ExpectedStoryPayload = Prisma.StoryGetPayload<{
  include: {
    user: {
      include: { profile: true };
    };
    _count: { select: { views: true; reactions: true } };
  };
}>;
export const _checkStory: SharedStory = {} as unknown as ExpectedStoryPayload;

// 4. Comment Type Check
type ExpectedCommentPayload = Prisma.CommentGetPayload<{
  include: {
    user: {
      include: { profile: true };
    };
    _count: { select: { replies: true; likes: true } };
  };
}>;
export const _checkComment: SharedComment =
  {} as unknown as ExpectedCommentPayload;
