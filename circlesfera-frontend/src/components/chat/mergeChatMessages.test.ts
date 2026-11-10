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

  it('keeps a GIF received during the fetch, though an older GIF has the same empty text', () => {
    const gif = (id: string) => ({
      id,
      title: '',
      url: `https://media.giphy.com/media/${id}/200.webp`,
      width: 200,
      height: 150,
    });
    const older = msg({
      id: 'real-1',
      senderId: 'ana',
      content: '',
      gif: gif('g-1'),
    });
    const received = msg({
      id: 'real-2',
      tempId: 'temp-ana',
      senderId: 'ana',
      content: '',
      gif: gif('g-2'),
    });

    expect(
      mergeServerMessagesWithOptimistic([older], [received]).map((m) => m.id),
    ).toEqual(['real-1', 'real-2']);
    expect(
      mergeServerMessagesWithOptimistic([older, received], [received]).map(
        (m) => m.id,
      ),
    ).toEqual(['real-1', 'real-2']);
  });

  it('keeps a GIF still sending when an older GIF of the sender is in the list', () => {
    const older = msg({
      id: 'real-1',
      content: '',
      gif: {
        id: 'g-1',
        title: '',
        url: 'https://media.giphy.com/a.webp',
        width: 1,
        height: 1,
      },
    });
    const sending = msg({
      id: 'temp-2',
      tempId: 'temp-2',
      content: '',
      gif: {
        id: 'g-2',
        title: '',
        url: 'https://media.giphy.com/b.webp',
        width: 1,
        height: 1,
      },
    });

    expect(
      mergeServerMessagesWithOptimistic([older], [sending]).map((m) => m.id),
    ).toEqual(['real-1', 'temp-2']);
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
