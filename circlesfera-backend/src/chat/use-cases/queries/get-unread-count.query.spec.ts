import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetConversationsQuery } from './get-conversations.query.js';
import { GetUnreadCountQuery } from './get-unread-count.query.js';

describe('GetUnreadCountQuery', () => {
  let query: GetUnreadCountQuery;
  let mockGetConversationsQuery: {
    execute: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGetConversationsQuery = {
      execute: vi.fn(),
    };
    query = new GetUnreadCountQuery(
      mockGetConversationsQuery as unknown as GetConversationsQuery,
    );
  });

  it('calculates unread count correctly across different conversation states', async () => {
    const profileId = 'prof-me';
    const now = new Date();
    const past = new Date(now.getTime() - 100000);
    const future = new Date(now.getTime() + 100000);

    mockGetConversationsQuery.execute.mockResolvedValue([
      // 1. No messages
      {
        id: 'conv-1',
        messages: [],
        participants: [{ profileId }],
      },
      // 2. Last message sent by me (should not count as unread)
      {
        id: 'conv-2',
        messages: [{ senderId: profileId, createdAt: future }],
        participants: [{ profileId, lastReadAt: past }],
      },
      // 3. Last message from other, my participant never read (no lastReadAt) -> unread
      {
        id: 'conv-3',
        messages: [{ senderId: 'prof-other', createdAt: now }],
        participants: [{ profileId, lastReadAt: null }],
      },
      // 4. Last message created after my lastReadAt -> unread
      {
        id: 'conv-4',
        messages: [{ senderId: 'prof-other', createdAt: future }],
        participants: [{ profileId, lastReadAt: past }],
      },
      // 5. Last message created before my lastReadAt -> read
      {
        id: 'conv-5',
        messages: [{ senderId: 'prof-other', createdAt: past }],
        participants: [{ profileId, lastReadAt: future }],
      },
    ]);

    const count = await query.execute(profileId);

    expect(count).toBe(2);
    expect(mockGetConversationsQuery.execute).toHaveBeenCalledWith(profileId);
  });
});
