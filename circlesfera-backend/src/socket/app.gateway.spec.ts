import { describe, expect, it, vi } from 'vitest';
import { AppGateway, type SocketWithAuth } from './app.gateway.js';

function gatewayWithServer(server: unknown): AppGateway {
  const gateway = Object.create(AppGateway.prototype) as AppGateway;
  gateway.server = server as AppGateway['server'];
  (gateway as unknown as { logger: unknown }).logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return gateway;
}

function mockSocket(profileId: string): SocketWithAuth {
  return {
    data: {
      user: { sub: 'user-account', email: 'a@b.com', profileId },
    },
  } as SocketWithAuth;
}

describe('AppGateway.addConversationToSocket', () => {
  it('grants in-memory access when @WebSocketServer is a Namespace (sockets is a Map)', () => {
    const socket = mockSocket('profile-1');
    const gateway = gatewayWithServer({
      sockets: new Map([['sid-1', socket]]),
    });

    gateway.addConversationToSocket('profile-1', 'conv-1');

    expect(socket.data.conversationIds?.has('conv-1')).toBe(true);
  });

  it('does not throw when the connected-sockets map has no nested .sockets', () => {
    const gateway = gatewayWithServer({
      sockets: new Map(),
    });

    expect(() =>
      gateway.addConversationToSocket('profile-1', 'conv-1'),
    ).not.toThrow();
  });

  it('still walks Server-shaped sockets.sockets maps', () => {
    const socket = mockSocket('profile-2');
    const gateway = gatewayWithServer({
      sockets: { sockets: new Map([['sid-2', socket]]) },
    });

    gateway.addConversationToSocket('profile-2', 'conv-2');

    expect(socket.data.conversationIds?.has('conv-2')).toBe(true);
  });
});

describe('AppGateway payload bounds and authorization', () => {
  it('drops call:signal when payload exceeds 32KB', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const socket = mockSocket('profile-caller');
    const oversizedSignal = 'x'.repeat(40000);

    gateway.handleCallSignal(
      { targetId: 'profile-target', signal: oversizedSignal },
      socket,
    );

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('forwards call:signal when payload is within 32KB and authorized', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });
    (
      gateway as unknown as { webrtcSignalingService: unknown }
    ).webrtcSignalingService = {
      authorizeSignal: vi.fn().mockReturnValue(true),
    };

    const socket = mockSocket('profile-caller');
    const validSignal = { type: 'offer', sdp: 'v=0...' };

    gateway.handleCallSignal(
      { targetId: 'profile-target', signal: validSignal },
      socket,
    );

    expect(mockTo).toHaveBeenCalledWith('user:profile-target');
    expect(mockEmit).toHaveBeenCalledWith('call:signal', {
      signal: validSignal,
      fromId: 'profile-caller',
    });
  });

  it('drops call:signal when unauthorized by webrtcSignalingService', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });
    (
      gateway as unknown as { webrtcSignalingService: unknown }
    ).webrtcSignalingService = {
      authorizeSignal: vi.fn().mockReturnValue(false),
    };

    const socket = mockSocket('profile-caller');
    const validSignal = { type: 'offer', sdp: 'v=0...' };

    gateway.handleCallSignal(
      { targetId: 'profile-target', signal: validSignal },
      socket,
    );

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('rejects call:accept when unauthorized', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });
    (
      gateway as unknown as { webrtcSignalingService: unknown }
    ).webrtcSignalingService = {
      authorizeAndAcceptCall: vi.fn().mockReturnValue({ ok: false }),
    };

    const socket = mockSocket('profile-callee');
    gateway.handleCallAccept({ callerId: 'profile-caller' }, socket);

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('emits call:accepted when authorized', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });
    (
      gateway as unknown as { webrtcSignalingService: unknown }
    ).webrtcSignalingService = {
      authorizeAndAcceptCall: vi.fn().mockReturnValue({ ok: true }),
    };

    const socket = mockSocket('profile-callee');
    gateway.handleCallAccept({ callerId: 'profile-caller' }, socket);

    expect(mockTo).toHaveBeenCalledWith('user:profile-caller');
    expect(mockEmit).toHaveBeenCalledWith('call:accepted', {
      receiverId: 'profile-callee',
    });
  });

  it('ignores send_reaction with invalid or oversized reaction string (> 32 chars)', async () => {
    const mockUseCase = { execute: vi.fn() };
    const gateway = gatewayWithServer({});
    (gateway as unknown as { addReactionUseCase: unknown }).addReactionUseCase =
      mockUseCase;

    const socket = mockSocket('profile-user');

    await gateway.handleSendReaction(
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        reaction: '🔥'.repeat(25),
      },
      socket,
    );

    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects send_reaction when user is not a participant in the conversation', async () => {
    const mockUseCase = { execute: vi.fn() };
    const mockPrisma = {
      participant: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const gateway = gatewayWithServer({});
    (gateway as unknown as { addReactionUseCase: unknown }).addReactionUseCase =
      mockUseCase;
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('profile-user');
    socket.data.conversationIds = new Set();

    await gateway.handleSendReaction(
      {
        messageId: 'msg-1',
        conversationId: 'conv-unauthorized',
        reaction: '❤️',
      },
      socket,
    );

    expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith({
      where: {
        conversationId_profileId: {
          conversationId: 'conv-unauthorized',
          profileId: 'profile-user',
        },
      },
    });
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });

  it('allows send_reaction and notifies conversation members when authorized', async () => {
    const mockUseCase = {
      execute: vi.fn().mockResolvedValue({ id: 'rec-1', reaction: '❤️' }),
    };
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockPrisma = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({
          participants: [
            { profileId: 'profile-user' },
            { profileId: 'profile-other' },
          ],
        }),
      },
    };
    const gateway = gatewayWithServer({ to: mockTo });
    (gateway as unknown as { addReactionUseCase: unknown }).addReactionUseCase =
      mockUseCase;
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('profile-user');
    socket.data.conversationIds = new Set(['conv-1']);

    await gateway.handleSendReaction(
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        reaction: '❤️',
      },
      socket,
    );

    expect(mockUseCase.execute).toHaveBeenCalledWith(
      'msg-1',
      'profile-user',
      '❤️',
    );
    expect(mockTo).toHaveBeenCalledWith('user:profile-user');
    expect(mockTo).toHaveBeenCalledWith('user:profile-other');
    expect(mockEmit).toHaveBeenCalledWith(
      'message_reaction',
      expect.objectContaining({
        messageId: 'msg-1',
        profileId: 'profile-user',
        reaction: '❤️',
      }),
    );
  });

  it('bounds live:chat messages to 500 characters', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-account',
          profiles: [{ id: 'profile-1', username: 'tester', avatar: null }],
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('profile-1');
    const longMessage = 'A'.repeat(800);

    await gateway.handleLiveChat(
      { streamId: 'stream-123', message: longMessage },
      socket,
    );

    expect(mockTo).toHaveBeenCalledWith('live:stream-123');
    expect(mockEmit).toHaveBeenCalledWith(
      'live:chat_message',
      expect.objectContaining({
        message: 'A'.repeat(500),
      }),
    );
  });

  it('rejects live:pin_comment when caller is not the stream host or co-host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: 'cohost-profile',
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('viewer-profile');

    await gateway.handleLivePinComment(
      {
        streamId: 'stream-1',
        commentId: 'comment-1',
        message: 'A pinned comment',
        username: 'viewer',
      },
      socket,
    );

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('allows live:pin_comment when caller is the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('host-profile');

    await gateway.handleLivePinComment(
      {
        streamId: 'stream-1',
        commentId: 'comment-1',
        message: 'Important update',
        username: 'host',
      },
      socket,
    );

    expect(mockTo).toHaveBeenCalledWith('live:stream-1');
    expect(mockEmit).toHaveBeenCalledWith(
      'live:comment_pinned',
      expect.objectContaining({
        commentId: 'comment-1',
        message: 'Important update',
        username: 'host',
      }),
    );
  });

  it('rejects live:unpin_comment when caller is not the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('viewer-profile');

    await gateway.handleLiveUnpinComment({ streamId: 'stream-1' }, socket);

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('allows live:unpin_comment when caller is the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('host-profile');

    await gateway.handleLiveUnpinComment({ streamId: 'stream-1' }, socket);

    expect(mockTo).toHaveBeenCalledWith('live:stream-1');
    expect(mockEmit).toHaveBeenCalledWith('live:comment_unpinned', {
      streamId: 'stream-1',
    });
  });

  it('rejects live:set_goal when caller is not the stream host or target is invalid', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    // Test non-host
    const viewerSocket = mockSocket('viewer-profile');
    await gateway.handleLiveSetGoal(
      { streamId: 'stream-1', title: 'New Goal', target: 500 },
      viewerSocket,
    );
    expect(mockEmit).not.toHaveBeenCalled();

    // Test invalid target (target <= 0 or > 1,000,000)
    const hostSocket = mockSocket('host-profile');
    await gateway.handleLiveSetGoal(
      { streamId: 'stream-1', title: 'New Goal', target: 0 },
      hostSocket,
    );
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('allows live:set_goal when caller is the stream host and target is valid', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const hostSocket = mockSocket('host-profile');
    await gateway.handleLiveSetGoal(
      { streamId: 'stream-1', title: 'Followers Goal', target: 1000 },
      hostSocket,
    );

    expect(mockTo).toHaveBeenCalledWith('live:stream-1');
    expect(mockEmit).toHaveBeenCalledWith('live:goal_set', {
      title: 'Followers Goal',
      target: 1000,
      current: 0,
    });
  });

  it('rejects live:highlight_question when caller is not the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('viewer-profile');
    await gateway.handleLiveHighlightQuestion(
      {
        streamId: 'stream-1',
        questionId: 'q-1',
        question: 'What is your favorite color?',
        username: 'viewer',
      },
      socket,
    );

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('allows live:highlight_question and live:clear_question when caller is the host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const mockPrisma = {
      liveStream: {
        findUnique: vi.fn().mockResolvedValue({
          hostId: 'host-profile',
          coHostId: null,
        }),
      },
    };
    (gateway as unknown as { prisma: unknown }).prisma = mockPrisma;

    const socket = mockSocket('host-profile');
    await gateway.handleLiveHighlightQuestion(
      {
        streamId: 'stream-1',
        questionId: 'q-1',
        question: 'What is next?',
        username: 'fan',
      },
      socket,
    );

    expect(mockTo).toHaveBeenCalledWith('live:stream-1');
    expect(mockEmit).toHaveBeenCalledWith(
      'live:question_highlighted',
      expect.objectContaining({
        id: 'q-1',
        question: 'What is next?',
        username: 'fan',
      }),
    );

    await gateway.handleLiveClearQuestion({ streamId: 'stream-1' }, socket);
    expect(mockEmit).toHaveBeenCalledWith('live:question_cleared');
  });

  it('emits live:question_asked with trimmed content', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const socket = mockSocket('viewer-profile');
    await gateway.handleLiveAskQuestion(
      {
        streamId: 'stream-1',
        question: '  How are you?  ',
        username: 'viewer',
      },
      socket,
    );

    expect(mockTo).toHaveBeenCalledWith('live:stream-1');
    expect(mockEmit).toHaveBeenCalledWith(
      'live:question_asked',
      expect.objectContaining({
        question: 'How are you?',
        username: 'viewer',
      }),
    );
  });

  it('dispatches real-time notification to user room on notification.dispatched event', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    const payload = {
      recipientId: 'profile-10',
      notification: {
        id: 'notif-1',
        type: 'LIKE',
        content: 'liked your post',
      },
    };

    gateway.handleNotificationDispatched(payload);

    expect(mockTo).toHaveBeenCalledWith('user:profile-10');
    expect(mockEmit).toHaveBeenCalledWith('notification', payload.notification);
  });
});
