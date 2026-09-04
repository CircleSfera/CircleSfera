import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import {
  getMessageDisplayText,
  getMessagePreviewText,
  isSharedPostMessage,
} from './chatMessageDisplay';

describe('chatMessageDisplay', () => {
  it('detects shared posts by postId or post relation', () => {
    expect(isSharedPostMessage({ postId: 'p1', content: 'x' })).toBe(true);
    expect(
      isSharedPostMessage({
        post: { id: 'p1' } as Message['post'],
        content: 'x',
      }),
    ).toBe(true);
  });

  it('detects legacy shared post content prefixes', () => {
    expect(
      isSharedPostMessage({
        content: 'Compartió un post: smoke-profile-drift',
      }),
    ).toBe(true);
  });

  it('hides redundant caption when a shared post card is present', () => {
    const msg = {
      postId: 'p1',
      post: { id: 'p1' } as Message['post'],
      content: 'smoke-profile-drift-1788016895851-edited',
    } as Message;

    expect(
      getMessageDisplayText(msg, msg.content!, ((key: string) => key) as never),
    ).toBeNull();
  });

  it('shows a friendly preview for shared posts in the inbox list', () => {
    const msg = {
      postId: 'p1',
      content: 'smoke-profile-drift-1788016895851-edited',
    } as Message;

    expect(getMessagePreviewText(msg, ((key: string) => key) as never)).toBe(
      'chat.shared_post',
    );
  });
});
