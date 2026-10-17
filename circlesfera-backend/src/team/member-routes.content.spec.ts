import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CommentsController } from '../comments/comments.controller.js';
import { PostsController } from '../posts/posts.controller.js';
import { ProfilesController } from '../profiles/profiles.controller.js';
import { StoriesController } from '../stories/stories.controller.js';
import { UploadsController } from '../uploads/uploads.controller.js';
import { MEMBER_ALLOWED } from './member-allowed.decorator.js';
import { RECORDS_ACTIVITY } from './records-activity.decorator.js';

const meta = (target: { prototype: object }, method: string, key: string) =>
  Reflect.getMetadata(
    key,
    (target.prototype as Record<string, unknown>)[method] as object,
  );

// Step 4 of team access: each content route, what opens it to a member and
// what it records.
describe('content routes open to team members', () => {
  it.each([
    [PostsController, 'create', 'content.manage', 'POST_PUBLISHED'],
    [PostsController, 'update', 'content.manage', 'POST_EDITED'],
    [PostsController, 'remove', 'content.manage', 'POST_DELETED'],
    [StoriesController, 'create', 'content.manage', 'STORY_PUBLISHED'],
    [StoriesController, 'remove', 'content.manage', 'STORY_DELETED'],
    [CommentsController, 'create', 'comments.answer', 'COMMENT_WRITTEN'],
    [CommentsController, 'update', 'comments.answer', 'COMMENT_EDITED'],
    [CommentsController, 'remove', 'comments.answer', 'COMMENT_DELETED'],
    [ProfilesController, 'updateProfile', 'profile.edit', 'PROFILE_EDITED'],
  ] as const)('%s.%s', (controller, method, access, action) => {
    expect(meta(controller, method, MEMBER_ALLOWED)).toBe(access);
    expect(meta(controller, method, RECORDS_ACTIVITY)).toBe(action);
  });

  it('uploading opens for publishing, and records nothing on its own', () => {
    expect(meta(UploadsController, 'uploadFile', MEMBER_ALLOWED)).toBe(
      'content.manage',
    );
    expect(
      meta(UploadsController, 'uploadFile', RECORDS_ACTIVITY),
    ).toBeUndefined();
  });
});
