import { describe, expect, it, vi } from 'vitest';
import { AppGateway, type SocketWithAuth } from './app.gateway.js';

interface ServiceOverrides {
  socketAuthService?: {
    authenticate: ReturnType<typeof vi.fn>;
    extractToken?: ReturnType<typeof vi.fn>;
  };
  socketPresenceService?: {
    getFollowPresenceRooms: ReturnType<typeof vi.fn>;
    setUserOnline: ReturnType<typeof vi.fn>;
    setUserOffline: ReturnType<typeof vi.fn>;
  };
  chatRealtimeService?: {
    addReaction: ReturnType<typeof vi.fn>;
  };
  webrtcSignalingService?: {
    authorizeSignal: ReturnType<typeof vi.fn>;
    authorizeAndAcceptCall: ReturnType<typeof vi.fn>;
    authorizeAndDeclineCall: ReturnType<typeof vi.fn>;
    authorizeAndInitiateCall: ReturnType<typeof vi.fn>;
    authorizeAndEndCall: ReturnType<typeof vi.fn>;
    getCallerProfile: ReturnType<typeof vi.fn>;
    handleUserDisconnect: ReturnType<typeof vi.fn>;
  };
  liveRealtimeService?: {
    incrementViewerCount: ReturnType<typeof vi.fn>;
    decrementViewerCount: ReturnType<typeof vi.fn>;
    isStreamHostOrCoHost: ReturnType<typeof vi.fn>;
    getUserProfile: ReturnType<typeof vi.fn>;
  };
  configService?: {
    get: ReturnType<typeof vi.fn>;
  };
}

function gatewayWithServer(
  server: unknown,
  overrides: ServiceOverrides = {},
): AppGateway {
  const gateway = new AppGateway(
    (overrides.socketAuthService as any) ?? { authenticate: vi.fn() },
    (overrides.socketPresenceService as any) ?? {
      getFollowPresenceRooms: vi.fn().mockResolvedValue([]),
      setUserOnline: vi.fn().mockResolvedValue(undefined),
      setUserOffline: vi.fn().mockResolvedValue({ lastSeenAt: new Date() }),
    },
    (overrides.chatRealtimeService as any) ?? { addReaction: vi.fn() },
    (overrides.webrtcSignalingService as any) ?? {
      authorizeSignal: vi.fn(),
      authorizeAndAcceptCall: vi.fn(),
      authorizeAndDeclineCall: vi.fn(),
      authorizeAndInitiateCall: vi.fn(),
      authorizeAndEndCall: vi.fn(),
      getCallerProfile: vi.fn(),
      handleUserDisconnect: vi.fn().mockReturnValue([]),
    },
    (overrides.liveRealtimeService as any) ?? {
      incrementViewerCount: vi.fn().mockResolvedValue(1),
      decrementViewerCount: vi.fn().mockResolvedValue(0),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
      getUserProfile: vi.fn().mockResolvedValue(null),
    },
    overrides.configService as any,
  );
  gateway.server = server as AppGateway['server'];

  return gateway;
}

function mockSocket(profileId: string): SocketWithAuth {
  return {
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    emit: vi.fn(),
    data: {
      user: { sub: 'user-account', email: 'a@b.com', profileId },
      conversationIds: new Set<string>(),
    },
  } as unknown as SocketWithAuth;
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

describe('AppGateway connection and presence routing', () => {
  it('authenticates client and joins presence and user rooms on handleConnection', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockAuthService = {
      authenticate: vi.fn().mockResolvedValue({
        user: { sub: 'user-1', email: 'u1@example.com', profileId: 'prof-1' },
        conversationIds: new Set(['c-1']),
      }),
    };
    const mockPresenceService = {
      getFollowPresenceRooms: vi.fn().mockResolvedValue(['presence:prof-2']),
      setUserOnline: vi.fn().mockResolvedValue(undefined),
      setUserOffline: vi.fn().mockResolvedValue({ lastSeenAt: new Date() }),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        socketAuthService: mockAuthService,
        socketPresenceService: mockPresenceService,
      },
    );

    const client = mockSocket('prof-init');
    await gateway.handleConnection(client);

    expect(mockAuthService.authenticate).toHaveBeenCalledWith(client);
    expect(client.join).toHaveBeenCalledWith('user:prof-1');
    expect(client.join).toHaveBeenCalledWith(['presence:prof-2']);
    expect(client.join).toHaveBeenCalledWith('presence:prof-1');
    expect(mockPresenceService.setUserOnline).toHaveBeenCalledWith('user-1');
    expect(mockTo).toHaveBeenCalledWith('presence:prof-1');
    expect(mockEmit).toHaveBeenCalledWith('user_status', {
      profileId: 'prof-1',
      isOnline: true,
    });
  });

  it('propagates correlation id from handshake headers onto socket client data', async () => {
    const mockAuthService = {
      authenticate: vi.fn().mockResolvedValue({
        user: { sub: 'user-1', email: 'u1@example.com', profileId: 'prof-1' },
        conversationIds: new Set(),
      }),
    };
    const gateway = gatewayWithServer(
      { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
      { socketAuthService: mockAuthService },
    );

    const client = mockSocket('prof-init');
    (client as any).handshake = {
      headers: { 'x-correlation-id': 'realtime-corr-123' },
    };

    await gateway.handleConnection(client);

    expect(client.data.correlationId).toBe('realtime-corr-123');
  });

  it('sets user offline and cleans up calls on handleDisconnect', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const fixedDate = new Date('2026-09-16T12:00:00Z');
    const mockPresenceService = {
      getFollowPresenceRooms: vi.fn().mockResolvedValue([]),
      setUserOnline: vi.fn().mockResolvedValue(undefined),
      setUserOffline: vi.fn().mockResolvedValue({ lastSeenAt: fixedDate }),
    };
    const mockWebrtcService = {
      authorizeSignal: vi.fn(),
      authorizeAndAcceptCall: vi.fn(),
      authorizeAndDeclineCall: vi.fn(),
      authorizeAndInitiateCall: vi.fn(),
      authorizeAndEndCall: vi.fn(),
      getCallerProfile: vi.fn(),
      handleUserDisconnect: vi.fn().mockReturnValue([
        { state: 'RINGING', peerId: 'peer-ringing' },
        { state: 'ACTIVE', peerId: 'peer-active' },
      ]),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        socketPresenceService: mockPresenceService,
        webrtcSignalingService: mockWebrtcService,
      },
    );

    const client = mockSocket('prof-1');
    await gateway.handleDisconnect(client);

    expect(mockPresenceService.setUserOffline).toHaveBeenCalledWith(
      'user-account',
    );
    expect(mockTo).toHaveBeenCalledWith('presence:prof-1');
    expect(mockEmit).toHaveBeenCalledWith('user_status', {
      profileId: 'prof-1',
      isOnline: false,
      lastSeenAt: fixedDate.toISOString(),
    });
    expect(mockTo).toHaveBeenCalledWith('user:peer-ringing');
    expect(mockEmit).toHaveBeenCalledWith('call:declined');
    expect(mockTo).toHaveBeenCalledWith('user:peer-active');
    expect(mockEmit).toHaveBeenCalledWith('call:ended');
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
    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        webrtcSignalingService: {
          authorizeSignal: vi.fn().mockReturnValue(true),
          authorizeAndAcceptCall: vi.fn(),
          authorizeAndDeclineCall: vi.fn(),
          authorizeAndInitiateCall: vi.fn(),
          authorizeAndEndCall: vi.fn(),
          getCallerProfile: vi.fn(),
          handleUserDisconnect: vi.fn().mockReturnValue([]),
        },
      },
    );

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
    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        webrtcSignalingService: {
          authorizeSignal: vi.fn().mockReturnValue(false),
          authorizeAndAcceptCall: vi.fn(),
          authorizeAndDeclineCall: vi.fn(),
          authorizeAndInitiateCall: vi.fn(),
          authorizeAndEndCall: vi.fn(),
          getCallerProfile: vi.fn(),
          handleUserDisconnect: vi.fn().mockReturnValue([]),
        },
      },
    );

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
    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        webrtcSignalingService: {
          authorizeSignal: vi.fn(),
          authorizeAndAcceptCall: vi.fn().mockReturnValue({ ok: false }),
          authorizeAndDeclineCall: vi.fn(),
          authorizeAndInitiateCall: vi.fn(),
          authorizeAndEndCall: vi.fn(),
          getCallerProfile: vi.fn(),
          handleUserDisconnect: vi.fn().mockReturnValue([]),
        },
      },
    );

    const socket = mockSocket('profile-callee');
    gateway.handleCallAccept({ callerId: 'profile-caller' }, socket);

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('emits call:accepted when authorized', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer(
      { to: mockTo },
      {
        webrtcSignalingService: {
          authorizeSignal: vi.fn(),
          authorizeAndAcceptCall: vi.fn().mockReturnValue({ ok: true }),
          authorizeAndDeclineCall: vi.fn(),
          authorizeAndInitiateCall: vi.fn(),
          authorizeAndEndCall: vi.fn(),
          getCallerProfile: vi.fn(),
          handleUserDisconnect: vi.fn().mockReturnValue([]),
        },
      },
    );

    const socket = mockSocket('profile-callee');
    gateway.handleCallAccept({ callerId: 'profile-caller' }, socket);

    expect(mockTo).toHaveBeenCalledWith('user:profile-caller');
    expect(mockEmit).toHaveBeenCalledWith('call:accepted', {
      receiverId: 'profile-callee',
    });
  });

  it('ignores send_reaction with invalid or oversized reaction string (> 32 chars)', async () => {
    const mockChatRealtime = { addReaction: vi.fn() };
    const gateway = gatewayWithServer(
      {},
      { chatRealtimeService: mockChatRealtime },
    );

    const socket = mockSocket('profile-user');

    await gateway.handleSendReaction(
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        reaction: '🔥'.repeat(25),
      },
      socket,
    );

    expect(mockChatRealtime.addReaction).not.toHaveBeenCalled();
  });

  it('delegates send_reaction to ChatRealtimeService and emits to participants', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockChatRealtime = {
      addReaction: vi.fn().mockResolvedValue({
        success: true,
        grantConversationAccess: true,
        reactionRecord: { id: 'rec-1', reaction: '❤️' },
        participantProfileIds: ['profile-user', 'profile-other'],
      }),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { chatRealtimeService: mockChatRealtime },
    );

    const socket = mockSocket('profile-user');

    await gateway.handleSendReaction(
      {
        messageId: 'msg-1',
        conversationId: 'conv-1',
        reaction: '❤️',
      },
      socket,
    );

    expect(mockChatRealtime.addReaction).toHaveBeenCalledWith(
      'msg-1',
      'conv-1',
      'profile-user',
      '❤️',
      false,
    );
    expect(socket.data.conversationIds?.has('conv-1')).toBe(true);
    expect(mockTo).toHaveBeenCalledWith('user:profile-user');
    expect(mockTo).toHaveBeenCalledWith('user:profile-other');
    expect(mockEmit).toHaveBeenCalledWith('message_reaction', {
      messageId: 'msg-1',
      profileId: 'profile-user',
      reaction: '❤️',
      id: 'rec-1',
    });
  });

  it('bounds live:chat messages to 500 characters', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn(),
      getUserProfile: vi.fn().mockResolvedValue({
        id: 'profile-1',
        username: 'tester',
        avatar: null,
      }),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(true),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    const socket = mockSocket('viewer-profile');

    await gateway.handleLiveUnpinComment({ streamId: 'stream-1' }, socket);

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('allows live:unpin_comment when caller is the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(true),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    // Test non-host
    const viewerSocket = mockSocket('viewer-profile');
    await gateway.handleLiveSetGoal(
      { streamId: 'stream-1', title: 'New Goal', target: 500 },
      viewerSocket,
    );
    expect(mockEmit).not.toHaveBeenCalled();

    // Test invalid target (target <= 0 or > 1,000,000)
    mockLiveRealtime.isStreamHostOrCoHost.mockResolvedValue(true);
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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(true),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrCoHost: vi.fn().mockResolvedValue(true),
      getUserProfile: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

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

  it('ignores notification.dispatched event if recipientId or notification is missing', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    gateway.handleNotificationDispatched({} as any);
    expect(mockTo).not.toHaveBeenCalled();
  });

  it('directly sends notification to user room via sendNotification', () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const gateway = gatewayWithServer({ to: mockTo });

    gateway.sendNotification('prof-user', {
      id: 'notif-1',
      type: 'COMMENT',
      content: 'New comment',
    });

    expect(mockTo).toHaveBeenCalledWith('user:prof-user');
    expect(mockEmit).toHaveBeenCalledWith('notification', {
      id: 'notif-1',
      type: 'COMMENT',
      content: 'New comment',
    });
  });

  describe('connection and disconnection error resilience', () => {
    it('catches authentication errors in handleConnection and disconnects client', async () => {
      const mockAuthService = {
        authenticate: vi.fn().mockRejectedValueOnce(new Error('JWT expired')),
      };
      const gateway = gatewayWithServer(
        {},
        { socketAuthService: mockAuthService },
      );
      const client = mockSocket('p-fail');

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('catches presence errors in handleDisconnect gracefully', async () => {
      const mockPresenceService = {
        getFollowPresenceRooms: vi.fn(),
        setUserOnline: vi.fn(),
        setUserOffline: vi
          .fn()
          .mockRejectedValueOnce(new Error('Redis disconnect')),
      };
      const gateway = gatewayWithServer(
        {},
        { socketPresenceService: mockPresenceService },
      );
      const client = mockSocket('p-fail');

      await expect(
        gateway.handleDisconnect(client as any),
      ).resolves.not.toThrow();
    });

    it('disconnects client immediately if Origin header is unauthorized (CSWSH guard)', async () => {
      const mockAuthService = { authenticate: vi.fn() };
      const gateway = gatewayWithServer(
        {},
        { socketAuthService: mockAuthService },
      );
      const client = mockSocket('p-attacker');
      (client as any).handshake = {
        headers: { origin: 'https://attacker.example.com' },
      };

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(mockAuthService.authenticate).not.toHaveBeenCalled();
    });

    it('allows client connection if Origin header matches allowed origins', async () => {
      const mockAuthService = {
        authenticate: vi.fn().mockResolvedValue({
          user: { sub: 'user-1', email: 'u1@example.com', profileId: 'prof-1' },
          conversationIds: new Set(),
        }),
      };
      const mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'CORS_ORIGIN') return 'https://app.circlesfera.com';
          if (key === 'NODE_ENV') return 'production';
          return undefined;
        }),
      };
      const gateway = gatewayWithServer(
        { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
        {
          socketAuthService: mockAuthService,
          configService: mockConfigService,
        },
      );
      const client = mockSocket('prof-init');
      (client as any).handshake = {
        headers: { origin: 'https://app.circlesfera.com' },
      };

      await gateway.handleConnection(client as any);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(mockAuthService.authenticate).toHaveBeenCalledWith(client);
    });
  });

  describe('chat typing and read events', () => {
    it('handles typing_start only when conversation is accessible', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      const socket = mockSocket('prof-sender');
      socket.data.conversationIds = new Set(['c-1']);

      // Valid case
      await gateway.handleTypingStart(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).toHaveBeenCalledWith('user:prof-rec');
      expect(mockEmit).toHaveBeenCalledWith('user_typing', {
        profileId: 'prof-sender',
        conversationId: 'c-1',
      });

      // Missing conversationId or recipientId
      mockTo.mockClear();
      await gateway.handleTypingStart({} as any, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Inaccessible conversation
      mockTo.mockClear();
      await gateway.handleTypingStart(
        { conversationId: 'c-other', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('handles typing_stop only when conversation is accessible', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      const socket = mockSocket('prof-sender');
      socket.data.conversationIds = new Set(['c-1']);

      await gateway.handleTypingStop(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).toHaveBeenCalledWith('user:prof-rec');
      expect(mockEmit).toHaveBeenCalledWith('user_stopped_typing', {
        profileId: 'prof-sender',
        conversationId: 'c-1',
      });

      // Missing fields or unauthorized
      mockTo.mockClear();
      await gateway.handleTypingStop({} as any, socket);
      await gateway.handleTypingStop(
        { conversationId: 'c-other', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('handles mark_read only when conversation is accessible', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      const socket = mockSocket('prof-reader');
      socket.data.conversationIds = new Set(['c-1']);

      await gateway.handleMarkRead(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).toHaveBeenCalledWith('user:prof-rec');
      expect(mockEmit).toHaveBeenCalledWith(
        'messages_read',
        expect.objectContaining({
          conversationId: 'c-1',
          profileId: 'prof-reader',
          readAt: expect.any(String),
        }),
      );

      mockTo.mockClear();
      await gateway.handleMarkRead({} as any, socket);
      await gateway.handleMarkRead(
        { conversationId: 'c-other', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(mockTo).not.toHaveBeenCalled();
    });
  });

  describe('WebRTC call signaling flows', () => {
    it('handles call:invite when recipient is busy or unauthorized', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockWebrtc = {
        authorizeSignal: vi.fn(),
        authorizeAndAcceptCall: vi.fn(),
        authorizeAndDeclineCall: vi.fn(),
        authorizeAndInitiateCall: vi
          .fn()
          .mockResolvedValueOnce({ ok: false, reason: 'BUSY' })
          .mockResolvedValueOnce({ ok: false, reason: 'BLOCKED' }),
        authorizeAndEndCall: vi.fn(),
        getCallerProfile: vi.fn(),
        handleUserDisconnect: vi.fn().mockReturnValue([]),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { webrtcSignalingService: mockWebrtc },
      );
      const socket = mockSocket('prof-caller');

      // Busy
      await gateway.handleCallInvite(
        { targetId: 'prof-target', type: 'audio' },
        socket,
      );
      expect(socket.emit).toHaveBeenCalledWith('call:declined', {
        reason: 'busy',
      });
      expect(mockTo).not.toHaveBeenCalled();

      // Blocked / other failure
      await gateway.handleCallInvite(
        { targetId: 'prof-target', type: 'audio' },
        socket,
      );
      expect(mockTo).not.toHaveBeenCalled();

      // Missing callerId or targetId
      const emptySocket = mockSocket('');
      (emptySocket.data.user as any) = null;
      await gateway.handleCallInvite(
        { targetId: 'prof-target' } as any,
        emptySocket,
      );
      expect(mockWebrtc.authorizeAndInitiateCall).toHaveBeenCalledTimes(2);
    });

    it('handles call:invite successfully when authorized', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockWebrtc = {
        authorizeSignal: vi.fn(),
        authorizeAndAcceptCall: vi.fn(),
        authorizeAndDeclineCall: vi.fn(),
        authorizeAndInitiateCall: vi.fn().mockResolvedValue({
          ok: true,
          session: { callId: 'call-123' },
        }),
        authorizeAndEndCall: vi.fn(),
        getCallerProfile: vi
          .fn()
          .mockResolvedValue({ id: 'prof-caller', username: 'caller' }),
        handleUserDisconnect: vi.fn().mockReturnValue([]),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { webrtcSignalingService: mockWebrtc },
      );
      const socket = mockSocket('prof-caller');

      await gateway.handleCallInvite(
        { targetId: 'prof-target', type: 'video' },
        socket,
      );

      expect(mockTo).toHaveBeenCalledWith('user:prof-target');
      expect(mockEmit).toHaveBeenCalledWith('call:incoming', {
        callId: 'call-123',
        caller: { id: 'prof-caller', username: 'caller' },
        type: 'video',
        signalData: null,
      });
    });

    it('handles call:decline when authorized and unauthorized', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockWebrtc = {
        authorizeSignal: vi.fn(),
        authorizeAndAcceptCall: vi.fn(),
        authorizeAndDeclineCall: vi
          .fn()
          .mockReturnValueOnce({ ok: false })
          .mockReturnValueOnce({ ok: true }),
        authorizeAndInitiateCall: vi.fn(),
        authorizeAndEndCall: vi.fn(),
        getCallerProfile: vi.fn(),
        handleUserDisconnect: vi.fn().mockReturnValue([]),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { webrtcSignalingService: mockWebrtc },
      );
      const socket = mockSocket('prof-receiver');

      // Missing callerId
      gateway.handleCallDecline({} as any, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Unauthorized
      gateway.handleCallDecline({ callerId: 'prof-caller' }, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Authorized
      gateway.handleCallDecline({ callerId: 'prof-caller' }, socket);
      expect(mockTo).toHaveBeenCalledWith('user:prof-caller');
      expect(mockEmit).toHaveBeenCalledWith('call:declined');
    });

    it('handles call:hangup when authorized and unauthorized', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockWebrtc = {
        authorizeSignal: vi.fn(),
        authorizeAndAcceptCall: vi.fn(),
        authorizeAndDeclineCall: vi.fn(),
        authorizeAndInitiateCall: vi.fn(),
        authorizeAndEndCall: vi
          .fn()
          .mockReturnValueOnce({ ok: false })
          .mockReturnValueOnce({ ok: true }),
        getCallerProfile: vi.fn(),
        handleUserDisconnect: vi.fn().mockReturnValue([]),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { webrtcSignalingService: mockWebrtc },
      );
      const socket = mockSocket('prof-sender');

      // Missing targetId
      gateway.handleCallHangup({} as any, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Unauthorized
      gateway.handleCallHangup({ targetId: 'prof-target' }, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Authorized
      gateway.handleCallHangup({ targetId: 'prof-target' }, socket);
      expect(mockTo).toHaveBeenCalledWith('user:prof-target');
      expect(mockEmit).toHaveBeenCalledWith('call:ended');
    });
  });

  describe('Live stream join, leave, reactions and comments', () => {
    it('handles live:join and live:leave with viewer updates', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn().mockResolvedValue(5),
        decrementViewerCount: vi.fn().mockResolvedValue(4),
        isStreamHostOrCoHost: vi.fn(),
        getUserProfile: vi.fn(),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('prof-viewer');

      await gateway.handleLiveJoin({ streamId: 's-1' }, socket);
      expect(socket.join).toHaveBeenCalledWith('live:s-1');
      expect(mockTo).toHaveBeenCalledWith('live:s-1');
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_joined', {
        profileId: 'prof-viewer',
        viewerCount: 5,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_count_update', {
        streamId: 's-1',
        viewerCount: 5,
      });
      expect(socket.data.liveStreamIds?.has('s-1')).toBe(true);

      mockEmit.mockClear();
      await gateway.handleLiveLeave({ streamId: 's-1' }, socket);
      expect(socket.leave).toHaveBeenCalledWith('live:s-1');
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_left', {
        profileId: 'prof-viewer',
        viewerCount: 4,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_count_update', {
        streamId: 's-1',
        viewerCount: 4,
      });
      expect(socket.data.liveStreamIds?.has('s-1')).toBe(false);

      // Empty streamId or profileId
      const emptySocket = mockSocket('');
      (emptySocket.data.user as any) = null;
      await gateway.handleLiveJoin({ streamId: '' }, socket);
      await gateway.handleLiveJoin({ streamId: 's-1' }, emptySocket);
      await gateway.handleLiveLeave({ streamId: '' }, socket);
      await gateway.handleLiveLeave({ streamId: 's-1' }, emptySocket);
    });

    it('reconciles viewer counts for live streams still joined on disconnect (RT-004)', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockPresenceService = {
        getFollowPresenceRooms: vi.fn().mockResolvedValue([]),
        setUserOnline: vi.fn().mockResolvedValue(undefined),
        setUserOffline: vi
          .fn()
          .mockResolvedValue({ lastSeenAt: new Date('2026-09-23T00:00:00Z') }),
      };
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi
          .fn()
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(0),
        isStreamHostOrCoHost: vi.fn(),
        getUserProfile: vi.fn(),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        {
          socketPresenceService: mockPresenceService,
          liveRealtimeService: mockLiveRealtime,
        },
      );
      const socket = mockSocket('prof-abrupt');
      socket.data.liveStreamIds = new Set(['s-1', 's-2']);

      await gateway.handleDisconnect(socket);

      expect(mockLiveRealtime.decrementViewerCount).toHaveBeenCalledWith('s-1');
      expect(mockLiveRealtime.decrementViewerCount).toHaveBeenCalledWith('s-2');
      expect(mockTo).toHaveBeenCalledWith('live:s-1');
      expect(mockTo).toHaveBeenCalledWith('live:s-2');
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_left', {
        profileId: 'prof-abrupt',
        viewerCount: 2,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_count_update', {
        streamId: 's-1',
        viewerCount: 2,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_left', {
        profileId: 'prof-abrupt',
        viewerCount: 0,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_count_update', {
        streamId: 's-2',
        viewerCount: 0,
      });
    });

    it('skips viewer count reconciliation on disconnect when no live streams were joined', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi.fn(),
        isStreamHostOrCoHost: vi.fn(),
        getUserProfile: vi.fn(),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('prof-clean');

      await gateway.handleDisconnect(socket);

      expect(mockLiveRealtime.decrementViewerCount).not.toHaveBeenCalled();
    });

    it('handles live:unpin_comment when authorized and unauthorized', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi.fn(),
        isStreamHostOrCoHost: vi
          .fn()
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true),
        getUserProfile: vi.fn(),
      };

      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('prof-host');

      // Unauthorized
      await gateway.handleLiveUnpinComment({ streamId: 's-1' }, socket);
      expect(mockTo).not.toHaveBeenCalled();

      // Authorized
      await gateway.handleLiveUnpinComment({ streamId: 's-1' }, socket);
      expect(mockTo).toHaveBeenCalledWith('live:s-1');
      expect(mockEmit).toHaveBeenCalledWith('live:comment_unpinned', {
        streamId: 's-1',
      });

      // Missing streamId
      mockTo.mockClear();
      await gateway.handleLiveUnpinComment({} as any, socket);
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('handles live:heart and live:send_reaction with default and custom emoji', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });
      const socket = mockSocket('prof-user');

      // live:heart default
      await gateway.handleLiveHeart({ streamId: 's-1' } as any, socket);
      expect(mockTo).toHaveBeenCalledWith('live:s-1');
      expect(mockEmit).toHaveBeenCalledWith('live:heart_received', {
        profileId: 'prof-user',
        reaction: '❤️',
      });

      // live:heart custom
      await gateway.handleLiveHeart(
        { streamId: 's-1', reaction: '💖' },
        socket,
      );
      expect(mockEmit).toHaveBeenCalledWith('live:heart_received', {
        profileId: 'prof-user',
        reaction: '💖',
      });

      // live:send_reaction default
      await gateway.handleLiveSendReaction({ streamId: 's-1' } as any, socket);
      expect(mockEmit).toHaveBeenCalledWith('live:reaction_received', {
        profileId: 'prof-user',
        reaction: '🔥',
      });

      // live:send_reaction custom
      await gateway.handleLiveSendReaction(
        { streamId: 's-1', reaction: '🚀' },
        socket,
      );
      expect(mockEmit).toHaveBeenCalledWith('live:reaction_received', {
        profileId: 'prof-user',
        reaction: '🚀',
      });

      // Missing streamId or profileId
      mockTo.mockClear();
      await gateway.handleLiveHeart({} as any, socket);
      await gateway.handleLiveSendReaction({} as any, socket);
      expect(mockTo).not.toHaveBeenCalled();
    });
  });

  describe('EDA Domain Event Listeners', () => {
    it('dispatches chat.message.sent to participants', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({
        to: mockTo,
        sockets: new Map(),
      });

      gateway.handleChatMessageSent({
        participants: [{ profileId: 'p-1' }, { profileId: 'p-2' }],
        payload: { id: 'msg-1', conversationId: 'c-1', text: 'hello' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockTo).toHaveBeenCalledWith('user:p-2');
      expect(mockEmit).toHaveBeenCalledWith('receiveMessage', {
        id: 'msg-1',
        conversationId: 'c-1',
        text: 'hello',
      });
    });

    it('redacts a locked message content/media over the socket for non-sender participants', () => {
      // Security regression test: a freshly-sent locked message must never
      // leak its real content/media to a recipient over the realtime
      // channel, mirroring GetMessagesQuery's read-path redaction.
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({
        to: mockTo,
        sockets: new Map(),
      });

      gateway.handleChatMessageSent({
        participants: [{ profileId: 'sender-1' }, { profileId: 'recipient-1' }],
        payload: {
          id: 'msg-2',
          conversationId: 'c-1',
          senderId: 'sender-1',
          isLocked: true,
          priceCents: 999,
          content: 'The real secret content',
          url: 'https://media/secret.jpg',
          mediaType: 'image',
        },
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'receiveMessage',
        expect.objectContaining({
          content: 'The real secret content',
          priceCents: 999,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'receiveMessage',
        expect.objectContaining({
          content: 'This message is locked. Pay to unlock.',
          url: null,
          standardUrl: null,
          thumbnailUrl: null,
          mediaType: null,
          voiceUrl: null,
          priceCents: 999,
        }),
      );
    });

    it('dispatches chat.message.deleted to participants', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      gateway.handleChatMessageDeleted({
        participants: [{ profileId: 'p-1' }],
        payload: { messageId: 'm-1' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('message_deleted', {
        messageId: 'm-1',
      });
    });

    it('dispatches chat.message.edited to participants', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      gateway.handleChatMessageEdited({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'm-1', content: 'edited' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('message_edited', {
        id: 'm-1',
        content: 'edited',
      });
    });

    it('dispatches chat.conversation.updated to participants', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      gateway.handleChatConversationUpdated({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'c-1', title: 'New Title' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('conversation_updated', {
        id: 'c-1',
        title: 'New Title',
      });
    });

    it('dispatches chat.conversation.deleted to participants', () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      gateway.handleChatConversationDeleted({
        participants: [{ profileId: 'p-1' }],
        payload: { conversationId: 'c-1' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('conversationDeleted', {
        conversationId: 'c-1',
      });
    });

    it('adds conversation to socket on chat.conversation.created', () => {
      const socket = mockSocket('p-1');
      const gateway = gatewayWithServer({
        sockets: new Map([['s-1', socket]]),
      });

      gateway.handleChatConversationCreated({
        conversation: {
          id: 'c-new',
          participants: [{ profileId: 'p-1' }],
        },
      });

      expect(socket.data.conversationIds?.has('c-new')).toBe(true);
    });

    it('terminates connected sockets on user.session.terminate', () => {
      const socket = mockSocket('p-1');
      socket.disconnect = vi.fn();
      socket.emit = vi.fn();
      const mockDisconnectSockets = vi.fn();
      const mockRoomEmit = vi.fn();
      const gateway = gatewayWithServer({
        sockets: new Map([['s-1', socket]]),
        to: vi.fn().mockReturnValue({ emit: mockRoomEmit }),
        in: vi
          .fn()
          .mockReturnValue({ disconnectSockets: mockDisconnectSockets }),
      });

      gateway.handleUserSessionTerminate({
        userId: 'user-account',
        profileId: 'p-1',
        reason: 'Account is banned by administration',
      });

      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.emit).toHaveBeenCalledWith('session_terminated', {
        reason: 'Account is banned by administration',
      });
      expect(mockDisconnectSockets).toHaveBeenCalledWith(true);
    });
  });

  describe('additional edge cases and boundary checks', () => {
    it('returns empty array when connectedSockets has no server.sockets', () => {
      const gateway = gatewayWithServer({});
      gateway.addConversationToSocket('p-1', 'c-1');
    });

    it('creates Set when client.data.conversationIds is undefined in addConversationToSocket', () => {
      const socket = mockSocket('p-1');
      delete (socket.data as any).conversationIds;
      const gateway = gatewayWithServer({
        sockets: new Map([['s-1', socket]]),
      });
      gateway.addConversationToSocket('p-1', 'c-1');
      expect(socket.data.conversationIds?.has('c-1')).toBe(true);
    });

    it('handles empty callerProfileId or failed reaction in handleSendReaction', async () => {
      const mockChatRealtime = {
        addReaction: vi.fn().mockResolvedValue({
          success: false,
        }),
      };
      const gateway = gatewayWithServer(
        {},
        { chatRealtimeService: mockChatRealtime },
      );

      // Empty callerProfileId
      const emptySocket = mockSocket('');
      (emptySocket.data.user as any) = null;
      await gateway.handleSendReaction(
        { messageId: 'm-1', conversationId: 'c-1', reaction: '❤️' },
        emptySocket,
      );
      expect(mockChatRealtime.addReaction).not.toHaveBeenCalled();

      // Reaction returned success: false
      const socket = mockSocket('p-1');
      await gateway.handleSendReaction(
        { messageId: 'm-1', conversationId: 'c-1', reaction: '❤️' },
        socket,
      );
      expect(mockChatRealtime.addReaction).toHaveBeenCalled();
    });

    it('initializes conversationIds Set in handleSendReaction when grantConversationAccess is true', async () => {
      const mockChatRealtime = {
        addReaction: vi.fn().mockResolvedValue({
          success: true,
          grantConversationAccess: true,
          reactionRecord: { id: 'r-1', reaction: '👍' },
          participantProfileIds: [],
        }),
      };
      const gateway = gatewayWithServer(
        { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
        { chatRealtimeService: mockChatRealtime },
      );

      const socket = mockSocket('p-1');
      delete (socket.data as any).conversationIds;

      await gateway.handleSendReaction(
        { messageId: 'm-1', conversationId: 'c-new', reaction: '👍' },
        socket,
      );
      expect(socket.data.conversationIds?.has('c-new')).toBe(true);
    });

    it('handles circular signal data throwing in JSON.stringify', () => {
      const gateway = gatewayWithServer({});
      const socket = mockSocket('p-1');

      const circular: any = {};
      circular.self = circular;

      gateway.handleCallSignal(
        { targetId: 'p-target', signal: circular },
        socket,
      );
    });

    it('handles invalid or empty payload in handleLiveChat', async () => {
      const gateway = gatewayWithServer({});
      const socket = mockSocket('p-1');

      await gateway.handleLiveChat({} as any, socket);
      await gateway.handleLiveChat({ streamId: 's-1', message: '   ' }, socket);
    });

    it('handles invalid or empty payload in handleLivePinComment', async () => {
      const gateway = gatewayWithServer({});
      const socket = mockSocket('p-1');

      await gateway.handleLivePinComment({} as any, socket);

      const emptySocket = mockSocket('');
      (emptySocket.data.user as any) = null;
      await gateway.handleLivePinComment(
        {
          streamId: 's-1',
          commentId: 'cm-1',
          message: 'hello',
          username: 'user1',
        },
        emptySocket,
      );
    });

    it('handles missing callerProfileId in live stream handlers', async () => {
      const gateway = gatewayWithServer({});
      const emptySocket = mockSocket('');
      (emptySocket.data.user as any) = null;

      await gateway.handleLiveUnpinComment({ streamId: 's-1' }, emptySocket);
      await gateway.handleLiveHeart({ streamId: 's-1' } as any, emptySocket);
      await gateway.handleLiveSendReaction(
        { streamId: 's-1' } as any,
        emptySocket,
      );
      await gateway.handleLiveAskQuestion(
        { streamId: 's-1', question: 'Q?', username: 'user1' },
        emptySocket,
      );
      await gateway.handleLiveHighlightQuestion(
        {
          streamId: 's-1',
          questionId: 'q-1',
          question: 'Q?',
          username: 'user1',
        },
        emptySocket,
      );
      await gateway.handleLiveClearQuestion({ streamId: 's-1' }, emptySocket);
      await gateway.handleLiveSetGoal(
        { streamId: 's-1', title: 'Goal', target: 100 },
        emptySocket,
      );
    });

    it('handles invalid questions and unauthorized clear_question', async () => {
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi.fn(),
        isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
        getUserProfile: vi.fn(),
      };
      const gateway = gatewayWithServer(
        {},
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('p-1');

      // Invalid question in handleLiveAskQuestion
      await gateway.handleLiveAskQuestion({} as any, socket);
      await gateway.handleLiveAskQuestion(
        { streamId: 's-1', question: '   ', username: 'user1' },
        socket,
      );

      // Invalid question in handleLiveHighlightQuestion
      await gateway.handleLiveHighlightQuestion({} as any, socket);

      // Unauthorized clear_question
      await gateway.handleLiveClearQuestion({ streamId: 's-1' }, socket);
      // Missing streamId in clear_question
      await gateway.handleLiveClearQuestion({} as any, socket);
    });
  });
});
