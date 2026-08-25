import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import {
  mergeServerMessagesWithOptimistic,
  upsertSentMessage,
} from './mergeChatMessages';

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'server-1',
    content: 'Hey!',
    conversationId: 'conv-1',
    senderId: 'me',
    createdAt: '2026-08-21T01:18:00.000Z',
    updatedAt: '2026-08-21T01:18:00.000Z',
    ...overrides,
  } as Message;
}

describe('mergeServerMessagesWithOptimistic', () => {
  it('keeps a temp bubble when the history fetch is still empty', () => {
    const pending = msg({
      id: 'temp-1',
      tempId: 'temp-1',
      content: 'Como estas?',
    });

    expect(
      mergeServerMessagesWithOptimistic([], [pending]).map((m) => m.content),
    ).toEqual(['Como estas?']);
  });

  it('drops the temp bubble once the server list includes the same send', () => {
    const pending = msg({
      id: 'temp-1',
      tempId: 'temp-1',
      content: 'Como estas?',
    });
    const persisted = msg({ id: 'real-1', content: 'Como estas?' });

    expect(
      mergeServerMessagesWithOptimistic([persisted], [pending]).map(
        (m) => m.id,
      ),
    ).toEqual(['real-1']);
  });
});

describe('upsertSentMessage', () => {
  it('replaces the matching temp bubble with the persisted message', () => {
    const pending = msg({ id: 'temp-1', tempId: 'temp-1', content: 'Hey!' });
    const persisted = msg({ id: 'real-1', tempId: 'temp-1', content: 'Hey!' });

    expect(upsertSentMessage([pending], persisted).map((m) => m.id)).toEqual([
      'real-1',
    ]);
  });

  it('re-inserts the sent message if a stale fetch wiped the optimistic row', () => {
    const persisted = msg({ id: 'real-1', tempId: 'temp-1', content: 'Hey!' });

    expect(upsertSentMessage([], persisted).map((m) => m.id)).toEqual([
      'real-1',
    ]);
  });
});
