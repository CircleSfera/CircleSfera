import { describe, expect, it } from 'vitest';
import { PUSH_GROUP_COLUMN, PUSH_GROUPS, pushGroupOf } from './push-groups.js';

describe('pushGroupOf', () => {
  it('puts each kind of notification in its group', () => {
    expect(pushGroupOf('LIKE')).toBe('likes');
    expect(pushGroupOf('COMMENT_LIKE')).toBe('likes');
    expect(pushGroupOf('COMMENT')).toBe('comments');
    expect(pushGroupOf('MENTION')).toBe('comments');
    expect(pushGroupOf('FOLLOW')).toBe('follows');
    expect(pushGroupOf('FOLLOW_REQUEST')).toBe('follows');
    expect(pushGroupOf('FOLLOW_ACCEPTED')).toBe('follows');
    expect(pushGroupOf('MESSAGE')).toBe('messages');
    expect(pushGroupOf('REPLY_MESSAGE')).toBe('messages');
    expect(pushGroupOf('LIVE_STARTED')).toBe('live');
  });

  it('moderation, plan, payment and support notices have no group to switch off', () => {
    for (const type of ['MODERATION', 'SUBSCRIPTION', 'PAYMENT', 'SYSTEM']) {
      expect(pushGroupOf(type)).toBeNull();
    }
  });

  it('every group has its own switch on the Profile', () => {
    expect(Object.keys(PUSH_GROUP_COLUMN).sort()).toEqual(
      [...PUSH_GROUPS].sort(),
    );
    expect(new Set(Object.values(PUSH_GROUP_COLUMN)).size).toBe(
      PUSH_GROUPS.length,
    );
  });
});
