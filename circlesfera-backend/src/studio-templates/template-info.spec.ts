import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTemplateInfo } from './template-info.js';

const blocks = vi.hoisted(() => ({ isBlockedEitherWay: vi.fn() }));
vi.mock('../common/policies/block.policy.js', () => blocks);

const db = {} as never;
const post = (over: Record<string, unknown> = {}) => ({
  id: 'post',
  profileId: 'author',
  studioTemplate: null,
  madeWithTemplate: null,
  ...over,
});
const openFrame = {
  deletedAt: null,
  archivedAt: null,
  moderationStatus: 'VISIBLE',
  visibility: 'PUBLIC',
  profile: { privacyLevel: 'PUBLIC' },
};
const credit = (
  isPublic = true,
  postId: string | null = 'source',
  id = 'maker',
  frame: Record<string, unknown> | null = openFrame,
) => ({
  isPublic,
  postId,
  profile: { id, username: id },
  post: frame as typeof openFrame | null,
});

describe('the templates a post shows', () => {
  beforeEach(() => blocks.isBlockedEitherWay.mockResolvedValue(false));

  it('shows a Frame’s template while it is offered, and to its author either way', async () => {
    const offered = post({
      studioTemplate: { id: 't', uses: 2, isPublic: true },
    });
    const off = post({ studioTemplate: { id: 't', uses: 2, isPublic: false } });
    const [a, b, c] = await withTemplateInfo(db, [offered, off, off], 'viewer');
    expect(a.studioTemplate).toEqual({ id: 't', uses: 2 });
    expect(b.studioTemplate).toBeNull();
    const [own] = await withTemplateInfo(db, [off], 'author');
    expect(own.studioTemplate).toEqual({ id: 't', uses: 2, isPublic: false });
    expect(c).not.toHaveProperty('profile');
  });

  it('credits the template a post was made with, while it is offered', async () => {
    const [shown, off, frameless] = await withTemplateInfo(
      db,
      [
        post({ madeWithTemplate: credit() }),
        post({ madeWithTemplate: credit(false) }),
        post({ madeWithTemplate: credit(true, null) }),
      ],
      'viewer',
    );
    expect(shown.madeWithTemplate).toEqual({
      postId: 'source',
      username: 'maker',
    });
    expect(off.madeWithTemplate).toBeNull();
    expect(frameless.madeWithTemplate).toBeNull();
  });

  it.each([
    ['deleted', { deletedAt: new Date() }],
    ['archived', { archivedAt: new Date() }],
    ['moderated', { moderationStatus: 'HIDDEN' }],
    ['for followers', { visibility: 'FOLLOWERS' }],
    ['on a private account', { profile: { privacyLevel: 'PRIVATE' } }],
    ['gone', null],
  ])('does not credit a template whose Frame is %s', async (_what, change) => {
    const frame = change === null ? null : { ...openFrame, ...change };
    const [shown] = await withTemplateInfo(
      db,
      [
        post({
          madeWithTemplate: credit(true, 'source', 'maker', frame),
          templateId: 'tpl',
        }),
      ],
      'viewer',
    );
    expect(shown.madeWithTemplate).toBeNull();
    expect(shown).not.toHaveProperty('templateId');
  });

  it('does not credit someone the viewer and they have blocked, asking once per author', async () => {
    blocks.isBlockedEitherWay.mockImplementation(
      async (_db, _viewer, author) => author === 'maker',
    );
    const shown = await withTemplateInfo(
      db,
      [
        post({ madeWithTemplate: credit() }),
        post({ madeWithTemplate: credit() }),
        post({ madeWithTemplate: credit(true, 'other', 'friend') }),
      ],
      'viewer',
    );
    expect(shown.map((p) => p.madeWithTemplate)).toEqual([
      null,
      null,
      { postId: 'other', username: 'friend' },
    ]);
    expect(blocks.isBlockedEitherWay).toHaveBeenCalledTimes(2);
  });
});
