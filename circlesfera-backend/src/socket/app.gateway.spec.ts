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
}

function gatewayWithServer(
  server: unknown,
  overrides: ServiceOverrides = {},
): AppGateway {
  const gateway = Object.create(AppGateway.prototype) as AppGateway;
  gateway.server = server as AppGateway['server'];
  (gateway as unknown as { logger: unknown }).logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  (gateway as any).socketAuthService = overrides.socketAuthService ?? {
    authenticate: vi.fn(),
  };
  (gateway as any).socketPresenceService = overrides.socketPresenceService ?? {
    getFollowPresenceRooms: vi.fn().mockResolvedValue([]),
    setUserOnline: vi.fn().mockResolvedValue(undefined),
    setUserOffline: vi.fn().mockResolvedValue({ lastSeenAt: new Date() }),
  };
  (gateway as any).chatRealtimeService = overrides.chatRealtimeService ?? {
    addReaction: vi.fn(),
  };
  (gateway as any).webrtcSignalingService =
    overrides.webrtcSignalingService ?? {
      authorizeSignal: vi.fn(),
      authorizeAndAcceptCall: vi.fn(),
      authorizeAndDeclineCall: vi.fn(),
      authorizeAndInitiateCall: vi.fn(),
      authorizeAndEndCall: vi.fn(),
      getCallerProfile: vi.fn(),
      handleUserDisconnect: vi.fn().mockReturnValue([]),
    };
  (gateway as any).liveRealtimeService = overrides.liveRealtimeService ?? {
    incrementViewerCount: vi.fn().mockResolvedValue(1),
    decrementViewerCount: vi.fn().mockResolvedValue(0),
    isStreamHostOrCoHost: vi.fn().mockResolvedValue(false),
    getUserProfile: vi.fn().mockResolvedValue(null),
  };

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
});
