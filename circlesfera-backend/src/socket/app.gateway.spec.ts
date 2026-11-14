import { describe, expect, it, vi } from 'vitest';
import {
  AppGateway,
  CHAT_EVENT_BURST,
  CHAT_EVENTS_PER_SECOND,
  type SocketWithAuth,
} from './app.gateway.js';

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
    membersOf?: ReturnType<typeof vi.fn>;
    blocksAmong?: ReturnType<typeof vi.fn>;
    restricts?: ReturnType<typeof vi.fn>;
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
  liveRealtimeService?: Partial<{
    incrementViewerCount: ReturnType<typeof vi.fn>;
    canEnterRoom: ReturnType<typeof vi.fn>;
    decrementViewerCount: ReturnType<typeof vi.fn>;
    isStreamHostOrOnAirGuest: ReturnType<typeof vi.fn>;
    getChatAuthor: ReturnType<typeof vi.fn>;
    hasElitePlan: ReturnType<typeof vi.fn>;
  }>;
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
    (overrides.chatRealtimeService as any) ?? {
      addReaction: vi.fn(),
      // Everyone asked about is in the conversation.
      membersOf: vi.fn(
        async (_conversationId: string, ids: string[]) => new Set(ids),
      ),
      // No blocks among them unless a test says so.
      blocksAmong: vi.fn(async () => new Map()),
      // Nobody restricts anyone unless a test says so.
      restricts: vi.fn(async () => false),
    },
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
      canEnterRoom: vi.fn().mockResolvedValue(true),
      decrementViewerCount: vi.fn().mockResolvedValue(0),
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(false),
      getChatAuthor: vi.fn().mockResolvedValue(null),
    },
    overrides.configService as any,
  );
  gateway.server = server as AppGateway['server'];

  return gateway;
}

function mockSocket(
  profileId: string,
  liveRooms: string[] = [],
): SocketWithAuth {
  // The rooms of the connection, kept as the server keeps them.
  const rooms = new Set<string>(liveRooms.map((id) => `live:${id}`));
  return {
    rooms,
    join: vi.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: vi.fn(async (room: string) => {
      rooms.delete(room);
    }),
    disconnect: vi.fn(),
    emit: vi.fn(),
    data: {
      user: { sub: 'user-account', email: 'a@b.com', profileId },
      conversationIds: new Set<string>(),
      // The rooms of lives it joined.
      liveStreamIds: new Set<string>(liveRooms),
    },
  } as unknown as SocketWithAuth;
}

describe('AppGateway.addConversationToSocket', () => {
  it('grants in-memory access when @WebSocketServer is a Namespace (sockets is a Map)', async () => {
    const socket = mockSocket('profile-1');
    const gateway = gatewayWithServer({
      sockets: new Map([['sid-1', socket]]),
    });

    gateway.addConversationToSocket('profile-1', 'conv-1');

    expect(socket.data.conversationIds?.has('conv-1')).toBe(true);
  });

  it('does not throw when the connected-sockets map has no nested .sockets', async () => {
    const gateway = gatewayWithServer({
      sockets: new Map(),
    });

    expect(() =>
      gateway.addConversationToSocket('profile-1', 'conv-1'),
    ).not.toThrow();
  });

  it('still walks Server-shaped sockets.sockets maps', async () => {
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
    // An app that did not say it understands notices gets none.
    expect(client.join).not.toHaveBeenCalledWith('chat-notices:prof-1');
    expect(mockPresenceService.setUserOnline).toHaveBeenCalledWith('user-1');
    expect(mockTo).toHaveBeenCalledWith('presence:prof-1');
    expect(mockEmit).toHaveBeenCalledWith('user_status', {
      profileId: 'prof-1',
      isOnline: true,
    });
  });

  it('puts an app that understands notices from the app in their room', async () => {
    const gateway = gatewayWithServer(
      { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
      {
        socketAuthService: {
          authenticate: vi.fn().mockResolvedValue({
            user: {
              sub: 'user-1',
              email: 'u1@example.com',
              profileId: 'prof-1',
            },
            conversationIds: new Set(),
          }),
        },
        socketPresenceService: {
          getFollowPresenceRooms: vi.fn().mockResolvedValue([]),
          setUserOnline: vi.fn().mockResolvedValue(undefined),
          setUserOffline: vi.fn(),
        },
      },
    );

    const modern = mockSocket('prof-1');
    (modern as any).handshake = { auth: { features: ['chat-notices'] } };
    await gateway.handleConnection(modern);
    expect(modern.join).toHaveBeenCalledWith('chat-notices:prof-1');

    // A string, or any other feature, is not the list it expects.
    const odd = mockSocket('prof-1');
    (odd as any).handshake = { auth: { features: 'chat-notices' } };
    await gateway.handleConnection(odd);
    expect(odd.join).not.toHaveBeenCalledWith('chat-notices:prof-1');
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
  it('drops call:signal when payload exceeds 32KB', async () => {
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

  it('forwards call:signal when payload is within 32KB and authorized', async () => {
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

  it('drops call:signal when unauthorized by webrtcSignalingService', async () => {
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

  it('rejects call:accept when unauthorized', async () => {
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

  it('emits call:accepted when authorized', async () => {
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
      isStreamHostOrOnAirGuest: vi.fn(),
      getChatAuthor: vi.fn().mockResolvedValue({
        id: 'profile-1',
        username: 'tester',
        avatar: null,
      }),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    const socket = mockSocket('profile-1', ['stream-123']);
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

  it('shows a live comment as the Profile the person is using', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrOnAirGuest: vi.fn(),
      getChatAuthor: vi.fn().mockResolvedValue({
        id: 'profile-2',
        username: 'second',
        avatar: 'second.jpg',
      }),
    };
    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    await gateway.handleLiveChat(
      { streamId: 'stream-123', message: 'hey' },
      mockSocket('profile-2', ['stream-123']),
    );

    expect(mockLiveRealtime.getChatAuthor).toHaveBeenCalledWith('profile-2');
    expect(mockEmit).toHaveBeenCalledWith('live:chat_message', {
      id: expect.any(String),
      profile: { id: 'profile-2', username: 'second', avatar: 'second.jpg' },
      message: 'hey',
      timestamp: expect.any(String),
    });
  });

  it('sends no live comment without a Profile to show it as', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrOnAirGuest: vi.fn(),
      getChatAuthor: vi.fn().mockResolvedValue(null),
    };
    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );
    const socket = mockSocket('profile-gone', ['stream-123']);

    await gateway.handleLiveChat(
      { streamId: 'stream-123', message: 'hey' },
      socket,
    );
    expect(mockEmit).not.toHaveBeenCalled();

    (socket.data.user as { profileId?: string }).profileId = undefined;
    await gateway.handleLiveChat(
      { streamId: 'stream-123', message: 'hey' },
      socket,
    );
    expect(mockLiveRealtime.getChatAuthor).toHaveBeenCalledTimes(1);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('rejects live:pin_comment when caller is not the stream host or a guest on air', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(false),
      getChatAuthor: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    const socket = mockSocket('viewer-profile', ['stream-1']);

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
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(true),
      getChatAuthor: vi.fn(),
    };

    const gateway = gatewayWithServer(
      { to: mockTo },
      { liveRealtimeService: mockLiveRealtime },
    );

    const socket = mockSocket('host-profile', ['stream-1']);

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
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(false),
      getChatAuthor: vi.fn(),
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
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(true),
      getChatAuthor: vi.fn(),
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

  it('rejects live:highlight_question when caller is not the stream host', async () => {
    const mockEmit = vi.fn();
    const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    const mockLiveRealtime = {
      incrementViewerCount: vi.fn(),
      decrementViewerCount: vi.fn(),
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(false),
      getChatAuthor: vi.fn(),
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
      isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(true),
      getChatAuthor: vi.fn(),
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

    const socket = mockSocket('viewer-profile', ['stream-1']);
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

    it('tells nobody a Profile it restricts that it read their messages', async () => {
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const restricts = vi.fn().mockResolvedValue(true);
      const gateway = gatewayWithServer(
        { to: mockTo },
        {
          chatRealtimeService: {
            addReaction: vi.fn(),
            membersOf: vi.fn(async (_c: string, ids: string[]) => new Set(ids)),
            restricts,
          },
        },
      );
      const socket = mockSocket('prof-reader');
      socket.data.conversationIds = new Set(['c-1']);

      await gateway.handleMarkRead(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );

      expect(restricts).toHaveBeenCalledWith('prof-reader', 'prof-rec');
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('asks the database whether sender and recipient are in it now', async () => {
      const membersOf = vi.fn().mockResolvedValue(new Set(['prof-sender']));
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const gateway = gatewayWithServer(
        { to: mockTo },
        { chatRealtimeService: { addReaction: vi.fn(), membersOf } },
      );
      const socket = mockSocket('prof-sender');
      socket.data.conversationIds = new Set(['c-1']);

      // The recipient is no longer in it: nothing is said to them, and the
      // sender keeps the conversation.
      await gateway.handleTypingStart(
        { conversationId: 'c-1', recipientId: 'prof-gone' } as any,
        socket,
      );

      expect(membersOf).toHaveBeenCalledWith('c-1', [
        'prof-sender',
        'prof-gone',
      ]);
      expect(mockTo).not.toHaveBeenCalled();
      expect(socket.data.conversationIds.has('c-1')).toBe(true);
    });

    it('stops a socket whose Profile left from typing, reading or telling anything', async () => {
      const membersOf = vi.fn().mockResolvedValue(new Set(['prof-rec']));
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const gateway = gatewayWithServer(
        { to: mockTo },
        { chatRealtimeService: { addReaction: vi.fn(), membersOf } },
      );
      const socket = mockSocket('prof-left');
      socket.data.conversationIds = new Set(['c-1']);

      await gateway.handleTypingStart(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );

      expect(mockTo).not.toHaveBeenCalled();
      expect(socket.data.conversationIds.has('c-1')).toBe(false);

      // The socket forgot it, so the next event is not even looked up.
      membersOf.mockClear();
      await gateway.handleMarkRead(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );
      await gateway.handleTypingStop(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );
      expect(membersOf).not.toHaveBeenCalled();
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('ignores typing from a socket with no Profile', async () => {
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const gateway = gatewayWithServer({ to: mockTo });
      const socket = mockSocket('prof-sender');
      (socket.data.user as any) = null;

      await gateway.handleTypingStart(
        { conversationId: 'c-1', recipientId: 'prof-rec' } as any,
        socket,
      );

      expect(mockTo).not.toHaveBeenCalled();
    });
  });

  describe('the allowance of chat events of a socket', () => {
    it('drops what a socket sends past its burst, says so once, and lets it go on later', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-01T00:00:00Z') });
      try {
        const membersOf = vi.fn(
          async (_c: string, ids: string[]) => new Set(ids),
        );
        const addReaction = vi.fn().mockResolvedValue({ success: false });
        const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
        const gateway = gatewayWithServer(
          { to: mockTo },
          { chatRealtimeService: { addReaction, membersOf } },
        );
        const warn = vi.spyOn(
          (gateway as unknown as { logger: { warn: (m: string) => void } })
            .logger,
          'warn',
        );
        const socket = mockSocket('prof-sender');
        socket.data.conversationIds = new Set(['c-1']);
        const typing = { conversationId: 'c-1', recipientId: 'prof-rec' };

        for (let i = 0; i < CHAT_EVENT_BURST; i++) {
          await gateway.handleTypingStart(typing as any, socket);
        }
        expect(membersOf).toHaveBeenCalledTimes(CHAT_EVENT_BURST);

        // Past the burst, neither typing, reading nor reacting is looked up.
        await gateway.handleTypingStop(typing as any, socket);
        await gateway.handleMarkRead(typing as any, socket);
        await gateway.handleSendReaction(
          { messageId: 'm-1', conversationId: 'c-1', reaction: '👍' },
          socket,
        );
        expect(membersOf).toHaveBeenCalledTimes(CHAT_EVENT_BURST);
        expect(addReaction).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('prof-sender'),
        );

        // The allowance comes back with time, up to the burst.
        vi.advanceTimersByTime(1000);
        for (let i = 0; i < CHAT_EVENTS_PER_SECOND + 1; i++) {
          await gateway.handleTypingStart(typing as any, socket);
        }
        expect(membersOf).toHaveBeenCalledTimes(
          CHAT_EVENT_BURST + CHAT_EVENTS_PER_SECOND,
        );
        vi.advanceTimersByTime(60_000);
        expect(socket.data.chatBudget?.tokens).toBeLessThan(1);
        await gateway.handleSendReaction(
          { messageId: 'm-1', conversationId: 'c-1', reaction: '👍' },
          socket,
        );
        expect(addReaction).toHaveBeenCalledTimes(1);
        expect(socket.data.chatBudget?.tokens).toBe(CHAT_EVENT_BURST - 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps an allowance for each socket', async () => {
      const membersOf = vi.fn(
        async (_c: string, ids: string[]) => new Set(ids),
      );
      const gateway = gatewayWithServer(
        { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
        { chatRealtimeService: { addReaction: vi.fn(), membersOf } },
      );
      const busy = mockSocket('prof-sender');
      const other = mockSocket('prof-sender');
      for (const socket of [busy, other]) {
        socket.data.conversationIds = new Set(['c-1']);
      }
      const typing = { conversationId: 'c-1', recipientId: 'prof-rec' };

      for (let i = 0; i <= CHAT_EVENT_BURST; i++) {
        await gateway.handleTypingStart(typing as any, busy);
      }
      await gateway.handleTypingStart(typing as any, other);

      expect(membersOf).toHaveBeenCalledTimes(CHAT_EVENT_BURST + 1);
    });
  });

  describe('a Profile that leaves a conversation', () => {
    it('has it taken from every one of its sockets when it deletes or leaves it', async () => {
      const phone = mockSocket('p-1');
      const laptop = mockSocket('p-1');
      const other = mockSocket('p-2');
      const noList = mockSocket('p-1');
      for (const socket of [phone, laptop, other]) {
        socket.data.conversationIds = new Set(['c-1', 'c-2']);
      }
      delete (noList.data as any).conversationIds;
      const gateway = gatewayWithServer({
        sockets: new Map([
          ['s-1', phone],
          ['s-2', laptop],
          ['s-3', other],
          ['s-4', noList],
        ]),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      });

      await gateway.handleChatConversationDeleted({
        participants: [{ profileId: 'p-1' }],
        payload: { conversationId: 'c-1' },
      });

      expect([...phone.data.conversationIds!]).toEqual(['c-2']);
      expect([...laptop.data.conversationIds!]).toEqual(['c-2']);
      expect([...other.data.conversationIds!]).toEqual(['c-1', 'c-2']);
      expect(noList.data.conversationIds).toBeUndefined();
    });

    it('has it taken from its sockets when removed from the group', async () => {
      const removed = mockSocket('p-removed');
      const stays = mockSocket('p-stays');
      const declined = mockSocket('p-declined');
      for (const socket of [removed, stays, declined]) {
        socket.data.conversationIds = new Set(['c-1']);
      }
      const gateway = gatewayWithServer({
        sockets: new Map([
          ['s-1', removed],
          ['s-2', stays],
          ['s-3', declined],
        ]),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      });

      await gateway.handleChatConversationUpdated({
        participants: [
          { profileId: 'p-stays' },
          { profileId: 'p-declined' },
          { profileId: 'p-removed' },
        ],
        payload: {
          id: 'c-1',
          participants: [
            { profileId: 'p-stays', deletedAt: null },
            { profileId: 'p-declined', deletedAt: new Date() },
            null,
          ],
        },
      });

      expect(removed.data.conversationIds?.has('c-1')).toBe(false);
      expect(declined.data.conversationIds?.has('c-1')).toBe(false);
      expect(stays.data.conversationIds?.has('c-1')).toBe(true);
    });

    it('keeps every socket as it is when the update names no members', async () => {
      const socket = mockSocket('p-1');
      socket.data.conversationIds = new Set(['c-1']);
      const gateway = gatewayWithServer({
        sockets: new Map([['s-1', socket]]),
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      });

      await gateway.handleChatConversationUpdated({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'c-1', name: 'Renamed' },
      });

      expect(socket.data.conversationIds.has('c-1')).toBe(true);
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
    it('drops what is sent to a live from outside its room', async () => {
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const mockLiveRealtime = {
        decrementViewerCount: vi.fn(),
        getChatAuthor: vi.fn(),
        isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(true),
        hasElitePlan: vi.fn(),
      };
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const outsider = mockSocket('prof-outsider');
      const streamId = 's-closed';

      await gateway.handleLiveChat({ streamId, message: 'hola' }, outsider);
      await gateway.handleLiveHeart({ streamId } as never, outsider);
      await gateway.handleLiveSendReaction({ streamId } as never, outsider);
      await gateway.handleLiveAskQuestion(
        { streamId, question: '¿Qué tal?' } as never,
        outsider,
      );
      await gateway.handleLivePinComment(
        { streamId, commentId: 'c', message: 'm' } as never,
        outsider,
      );
      await gateway.handleLiveLeave({ streamId }, outsider);

      expect(mockTo).not.toHaveBeenCalled();
      expect(mockLiveRealtime.decrementViewerCount).not.toHaveBeenCalled();
    });

    it('counts a viewer once however often the same connection joins', async () => {
      const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn().mockResolvedValue(1),
        canEnterRoom: vi.fn().mockResolvedValue(true),
      };
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('prof-viewer');

      await gateway.handleLiveJoin({ streamId: 's-1' }, socket);
      await gateway.handleLiveJoin({ streamId: 's-1' }, socket);

      expect(mockLiveRealtime.incrementViewerCount).toHaveBeenCalledTimes(1);
    });

    it('keeps out of the room of a live whoever may not watch it', async () => {
      const mockTo = vi.fn();
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        canEnterRoom: vi.fn().mockResolvedValue(false),
      };
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const socket = mockSocket('prof-outsider');

      await gateway.handleLiveJoin({ streamId: 's-1' }, socket);

      expect(mockLiveRealtime.canEnterRoom).toHaveBeenCalledWith(
        's-1',
        'prof-outsider',
      );
      expect(socket.join).not.toHaveBeenCalled();
      expect(mockLiveRealtime.incrementViewerCount).not.toHaveBeenCalled();
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('handles live:join and live:leave with viewer updates', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn().mockResolvedValue(5),
        decrementViewerCount: vi.fn().mockResolvedValue(4),
        isStreamHostOrOnAirGuest: vi.fn(),
        getChatAuthor: vi.fn(),
        canEnterRoom: vi.fn().mockResolvedValue(true),
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

    it('takes every connection of a Profile out of a live room, on every server', async () => {
      const socketsLeave = vi.fn();
      const mockIn = vi.fn().mockReturnValue({ socketsLeave });
      const gateway = gatewayWithServer({ in: mockIn });

      await gateway.leaveLiveRoom('prof-hidden', 's-1');

      expect(mockIn).toHaveBeenCalledWith('user:prof-hidden');
      expect(socketsLeave).toHaveBeenCalledWith('live:s-1');
    });

    it('counts out the connections it takes out of a live, once, and lets them back in counted again', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const socketsLeave = vi.fn();
      const mockIn = vi.fn().mockReturnValue({ socketsLeave });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn().mockResolvedValue(3),
        decrementViewerCount: vi.fn().mockResolvedValue(2),
        isStreamHostOrOnAirGuest: vi.fn(),
        canEnterRoom: vi.fn().mockResolvedValue(true),
        getChatAuthor: vi.fn(),
      };
      const watching = mockSocket('prof-hidden', ['s-1']);
      const elsewhere = mockSocket('prof-hidden', ['s-2']);
      const other = mockSocket('prof-other', ['s-1']);
      const gateway = gatewayWithServer(
        {
          to: mockTo,
          in: mockIn,
          sockets: new Map([
            ['a', watching],
            ['b', elsewhere],
            ['c', other],
          ]),
        },
        { liveRealtimeService: mockLiveRealtime },
      );

      await gateway.leaveLiveRoom('prof-hidden', 's-1');
      // What the adapter does to the room on every server.
      watching.rooms.delete('live:s-1');

      expect(mockLiveRealtime.decrementViewerCount.mock.calls).toEqual([
        ['s-1'],
      ]);
      expect(watching.data.liveStreamIds?.has('s-1')).toBe(false);
      expect(elsewhere.data.liveStreamIds?.has('s-2')).toBe(true);
      expect(other.data.liveStreamIds?.has('s-1')).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_left', {
        profileId: 'prof-hidden',
        viewerCount: 2,
      });
      expect(mockEmit).toHaveBeenCalledWith('live:viewer_count_update', {
        streamId: 's-1',
        viewerCount: 2,
      });

      // Leaving after being taken out is not counted out twice.
      await gateway.handleLiveLeave({ streamId: 's-1' }, watching);
      expect(mockLiveRealtime.decrementViewerCount).toHaveBeenCalledTimes(1);

      // Let back in once the live is for them again, counted again.
      await gateway.handleLiveJoin({ streamId: 's-1' }, watching);
      expect(mockLiveRealtime.incrementViewerCount).toHaveBeenCalledWith('s-1');
    });

    it('refuses what a connection taken out of the room sends, and leaves the others as they are', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn().mockResolvedValue(2),
        decrementViewerCount: vi.fn().mockResolvedValue(1),
        isStreamHostOrOnAirGuest: vi.fn(),
        canEnterRoom: vi.fn().mockResolvedValue(true),
        getChatAuthor: vi.fn().mockResolvedValue({
          id: 'prof-other',
          username: 'other',
          avatar: null,
        }),
      };
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const hidden = mockSocket('prof-hidden', ['s-1']);
      const other = mockSocket('prof-other', ['s-1']);
      // What the server does to the hidden Profile's connections.
      hidden.rooms.delete('live:s-1');

      await gateway.handleLiveChat({ streamId: 's-1', message: 'hi' }, hidden);
      expect(mockEmit).not.toHaveBeenCalled();

      await gateway.handleLiveChat({ streamId: 's-1', message: 'hi' }, other);
      expect(mockEmit).toHaveBeenCalledWith(
        'live:chat_message',
        expect.objectContaining({ message: 'hi' }),
      );

      // A connection held by another server keeps the live in its list:
      // let back in without being counted twice.
      await gateway.handleLiveJoin({ streamId: 's-1' }, hidden);
      expect(hidden.rooms.has('live:s-1')).toBe(true);
      expect(mockLiveRealtime.incrementViewerCount).not.toHaveBeenCalled();
    });

    it('still counts down a connection taken out of the room when it leaves', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi.fn().mockResolvedValue(0),
        isStreamHostOrOnAirGuest: vi.fn(),
        getChatAuthor: vi.fn(),
      };
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: mockLiveRealtime },
      );
      const hidden = mockSocket('prof-hidden', ['s-1']);
      hidden.rooms.delete('live:s-1');

      await gateway.handleLiveLeave({ streamId: 's-1' }, hidden);

      expect(mockLiveRealtime.decrementViewerCount).toHaveBeenCalledWith('s-1');
      expect(hidden.data.liveStreamIds?.has('s-1')).toBe(false);
    });

    it('reconciles viewer counts for live streams still joined on disconnect', async () => {
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
        isStreamHostOrOnAirGuest: vi.fn(),
        getChatAuthor: vi.fn(),
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
        isStreamHostOrOnAirGuest: vi.fn(),
        getChatAuthor: vi.fn(),
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
        isStreamHostOrOnAirGuest: vi
          .fn()
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true),
        getChatAuthor: vi.fn(),
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

    it.each([
      [true, '💎'],
      [false, '🔥'],
    ])('a plan reaction: plan %s sends %s', async (hasPlan, sent) => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const hasElitePlan = vi.fn().mockResolvedValue(hasPlan);
      const gateway = gatewayWithServer(
        { to: mockTo },
        { liveRealtimeService: { hasElitePlan } },
      );
      const socket = mockSocket('prof-user', ['s-1']);

      await gateway.handleLiveSendReaction(
        { streamId: 's-1', reaction: '💎' },
        socket,
      );
      await gateway.handleLiveSendReaction(
        { streamId: 's-1', reaction: '💎' },
        socket,
      );

      expect(mockEmit).toHaveBeenLastCalledWith('live:reaction_received', {
        profileId: 'prof-user',
        reaction: sent,
      });
      // The plan is looked up once per connection, not on every tap.
      expect(hasElitePlan).toHaveBeenCalledTimes(1);
      expect(hasElitePlan).toHaveBeenCalledWith('prof-user');
    });

    it('a plan reaction cannot be slipped in through the heart either', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer(
        { to: mockTo },
        {
          liveRealtimeService: {
            hasElitePlan: vi.fn().mockResolvedValue(false),
          },
        },
      );

      await gateway.handleLiveHeart(
        { streamId: 's-1', reaction: '👑' },
        mockSocket('prof-user', ['s-1']),
      );

      expect(mockEmit).toHaveBeenCalledWith('live:heart_received', {
        profileId: 'prof-user',
        reaction: '❤️',
      });
    });

    it('handles live:heart and live:send_reaction with default and custom emoji', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });
      const socket = mockSocket('prof-user', ['s-1']);

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
    it('dispatches chat.message.sent to participants', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({
        to: mockTo,
        sockets: new Map(),
      });

      await gateway.handleChatMessageSent({
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

    it('sends a notice from the app only to the apps that understand it', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo, sockets: new Map() });
      const notice = {
        id: 'n-1',
        conversationId: 'c-1',
        senderId: 'p-2',
        content: '',
        kind: 'ADMIN_GRANTED',
      };

      await gateway.handleChatMessageSent({
        participants: [{ profileId: 'p-1' }, { profileId: 'p-2' }],
        payload: notice,
      });

      expect(mockTo.mock.calls).toEqual([
        ['chat-notices:p-1'],
        ['chat-notices:p-2'],
      ]);
      expect(mockEmit).toHaveBeenCalledWith('receiveMessage', notice);

      // A message a member wrote still goes to every app.
      mockTo.mockClear();
      await gateway.handleChatMessageSent({
        participants: [{ profileId: 'p-1' }],
        payload: { ...notice, id: 'm-1', kind: 'USER', content: 'hola' },
      });
      expect(mockTo.mock.calls).toEqual([['user:p-1']]);
    });

    it('sends a message once sent locked to every member as it is', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({
        to: mockTo,
        sockets: new Map(),
      });

      await gateway.handleChatMessageSent({
        participants: [{ profileId: 'sender-1' }, { profileId: 'recipient-1' }],
        payload: {
          id: 'msg-2',
          conversationId: 'c-1',
          senderId: 'sender-1',
          isLocked: true,
          content: 'The real content',
          url: 'https://media/photo.jpg',
          mediaType: 'image',
        },
      });

      expect(mockTo).toHaveBeenCalledWith('user:recipient-1');
      for (const [payload] of mockEmit.mock.calls.map((c) => c.slice(1))) {
        expect(payload).toMatchObject({
          content: 'The real content',
          url: 'https://media/photo.jpg',
          mediaType: 'image',
        });
      }
    });

    it('sends a shared post to each member as it is', async () => {
      const mockEmit = vi.fn();
      const gateway = gatewayWithServer(
        { to: vi.fn().mockReturnValue({ emit: mockEmit }), sockets: new Map() },
        {
          chatRealtimeService: {
            addReaction: vi.fn(),
            blocksAmong: vi.fn(async () => new Map()),
          },
        },
      );
      const post = { id: 'shared', profileId: 'a', media: [] };

      await gateway.handleChatMessageSent({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'm', conversationId: 'c-1', senderId: 'a', post },
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'receiveMessage',
        expect.objectContaining({ post }),
      );
    });

    it('dispatches chat.message.deleted to participants', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      await gateway.handleChatMessageDeleted({
        participants: [{ profileId: 'p-1' }],
        payload: { messageId: 'm-1' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('message_deleted', {
        messageId: 'm-1',
      });
    });

    describe('a message, as each member sees its people', () => {
      const capture = () => {
        const emits: { room: string; event: string; payload: any }[] = [];
        const to = vi.fn((room: string) => ({
          emit: (event: string, payload: unknown) =>
            emits.push({ room, event, payload }),
        }));
        const sent = (room: string, event: string) =>
          emits.find((e) => e.room === room && e.event === event)?.payload;
        return { emits, to, sent };
      };
      const group = [
        { profileId: 'a' },
        { profileId: 'b' },
        { profileId: 'c' },
      ];

      it("a reply quoting someone in a block with a member doesn't show them to that member", async () => {
        const { to, sent } = capture();
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(
                async () =>
                  new Map([
                    ['a', new Set(['b'])],
                    ['b', new Set(['a'])],
                  ]),
              ),
            } as never,
          },
        );
        (gateway as any).addConversationToSocket = vi.fn();

        await gateway.handleChatMessageSent({
          participants: group,
          payload: {
            id: 'm9',
            conversationId: 'g1',
            senderId: 'c',
            sender: { id: 'c', username: 'cat' },
            replyTo: { senderId: 'b', sender: { id: 'b', username: 'bob' } },
          },
        } as never);

        expect(sent('user:a', 'receiveMessage').replyTo.sender).toEqual({
          id: 'b',
          username: null,
          unavailable: true,
        });
        expect(sent('user:a', 'receiveMessage').sender.username).toBe('cat');
        expect(sent('user:c', 'receiveMessage').replyTo.sender.username).toBe(
          'bob',
        );
      });

      it('a notice from the app about someone in a block with a member names them unavailable to that member', async () => {
        const { to, sent } = capture();
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(async () => new Map([['a', new Set(['b'])]])),
            } as never,
          },
        );
        (gateway as any).addConversationToSocket = vi.fn();

        await gateway.handleChatMessageSent({
          participants: group,
          payload: {
            id: 'n1',
            conversationId: 'g1',
            kind: 'ADMIN_GRANTED',
            senderId: 'b',
            sender: { id: 'b', username: 'bob' },
          },
        } as never);

        const toA = to.mock.calls.findIndex(([room]) =>
          String(room).includes('a'),
        );
        expect(toA).toBeGreaterThanOrEqual(0);
        const payloads = (to.mock.results as any[]).length;
        expect(payloads).toBeGreaterThan(0);
        const forA = (sent as any)(to.mock.calls[toA][0], 'receiveMessage');
        expect(forA.sender).toEqual({
          id: 'b',
          username: null,
          unavailable: true,
        });
      });

      it('sends ids only when the blocks cannot be read, rather than nothing or everything', async () => {
        const { to, sent } = capture();
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(async () => {
                throw new Error('db down');
              }),
            } as never,
          },
        );
        (gateway as any).addConversationToSocket = vi.fn();

        await gateway.handleChatMessageSent({
          participants: group,
          payload: {
            id: 'm1',
            conversationId: 'g1',
            senderId: 'b',
            sender: { id: 'b', username: 'bob', avatar: '/b.jpg' },
          },
        } as never);
        await gateway.handleChatConversationUpdated({
          participants: group,
          payload: {
            id: 'g1',
            participants: [
              { profileId: 'b', profile: { id: 'b', username: 'bob' } },
            ],
          },
        } as never);

        expect(sent('user:a', 'receiveMessage').sender).toEqual({ id: 'b' });
        expect(
          sent('user:a', 'conversation_updated').participants[0].profile,
        ).toEqual({ id: 'b' });
      });

      it('keeps the events of a conversation in the order they happened', async () => {
        const { emits, to } = capture();
        let release: (value: Map<string, Set<string>>) => void = () => {};
        const slow = new Promise<Map<string, Set<string>>>((resolve) => {
          release = resolve;
        });
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(() => slow),
            } as never,
          },
        );

        const edited = gateway.handleChatMessageEdited({
          participants: [{ profileId: 'a' }],
          payload: { id: 'm1', conversationId: 'g1', senderId: 'b' },
        } as never);
        const deleted = gateway.handleChatMessageDeleted({
          participants: [{ profileId: 'a' }],
          payload: { messageId: 'm1', conversationId: 'g1' },
        } as never);
        release(new Map());
        await Promise.all([edited, deleted]);

        expect(emits.map((e) => e.event)).toEqual([
          'message_edited',
          'message_deleted',
        ]);
      });

      it('a delete waits for a send of the same conversation still reading the blocks', async () => {
        const { emits, to } = capture();
        let release: (value: Map<string, Set<string>>) => void = () => {};
        const slow = new Promise<Map<string, Set<string>>>((resolve) => {
          release = resolve;
        });
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(() => slow),
            } as never,
          },
        );
        (gateway as any).addConversationToSocket = vi.fn();

        const sentNow = gateway.handleChatMessageSent({
          participants: [{ profileId: 'a' }],
          payload: { id: 'm1', conversationId: 'g1', senderId: 'b' },
        } as never);
        const deleted = gateway.handleChatMessageDeleted({
          participants: [{ profileId: 'a' }],
          payload: { messageId: 'm1', conversationId: 'g1' },
        });
        release(new Map());
        await Promise.all([sentNow, deleted]);

        expect(emits.map((e) => e.event)).toEqual([
          'receiveMessage',
          'message_deleted',
        ]);
      });

      it('masks the author of a shared post or story and those who reacted, and keeps only ids of them when blocks fail', async () => {
        const payload = {
          id: 'm1',
          conversationId: 'g1',
          senderId: 'c',
          sender: { id: 'c', username: 'cat' },
          post: { profileId: 'b', profile: { id: 'b', username: 'bob' } },
          story: { profileId: 'b', profile: { id: 'b', username: 'bob' } },
          reactions: [{ profileId: 'b', profile: { username: 'bob' } }],
        };
        const run = async (blocksAmong: () => Promise<unknown>) => {
          const { to, sent } = capture();
          const gateway = gatewayWithServer(
            { to },
            {
              chatRealtimeService: {
                membersOf: vi.fn(),
                blocksAmong: vi.fn(blocksAmong),
              } as never,
            },
          );
          (gateway as any).addConversationToSocket = vi.fn();
          await gateway.handleChatMessageSent({
            participants: [{ profileId: 'a' }, { profileId: 'c' }],
            payload,
          } as never);
          return sent;
        };

        const masked = await run(
          async () =>
            new Map([
              ['a', new Set(['b'])],
              ['b', new Set(['a'])],
            ]),
        );
        const toA = masked('user:a', 'receiveMessage');
        expect(toA.post.profile).toEqual({
          id: 'b',
          username: null,
          unavailable: true,
        });
        expect(toA.story.profile.unavailable).toBe(true);
        expect(toA.reactions[0].profile).toEqual({
          username: null,
          unavailable: true,
        });
        expect(masked('user:c', 'receiveMessage').post.profile.username).toBe(
          'bob',
        );

        const failed = await run(async () => {
          throw new Error('db down');
        });
        const fallbackToA = failed('user:a', 'receiveMessage');
        expect(fallbackToA.post.profile).toEqual({ id: 'b' });
        expect(fallbackToA.reactions[0].profile).toEqual({});
        // The sender's own copy keeps their name.
        expect(failed('user:c', 'receiveMessage').sender).toEqual({
          id: 'c',
          username: 'cat',
        });
      });

      it('a failed event does not stop the next one of the conversation', async () => {
        const { emits, to } = capture();
        const gateway = gatewayWithServer(
          { to },
          {
            chatRealtimeService: {
              membersOf: vi.fn(),
              blocksAmong: vi.fn(async () => new Map()),
            } as never,
          },
        );
        (gateway as any).addConversationToSocket = vi.fn(() => {
          throw new Error('socket gone');
        });

        await gateway.handleChatMessageSent({
          participants: [{ profileId: 'a' }],
          payload: { id: 'm1', conversationId: 'g1', senderId: 'b' },
        } as never);
        await gateway.handleChatMessageDeleted({
          participants: [{ profileId: 'a' }],
          payload: { messageId: 'm1', conversationId: 'g1' },
        } as never);

        expect(emits.map((e) => e.event)).toEqual(['message_deleted']);
      });
    });

    it('masks, for each member, those in a block with them', async () => {
      const emits: { room: string; event: string; payload: any }[] = [];
      const mockTo = vi.fn((room: string) => ({
        emit: (event: string, payload: unknown) =>
          emits.push({ room, event, payload }),
      }));
      const blocks = new Map([
        ['me', new Set(['bob'])],
        ['bob', new Set(['me'])],
      ]);
      const gateway = gatewayWithServer(
        { to: mockTo },
        {
          chatRealtimeService: {
            membersOf: vi.fn(),
            blocksAmong: vi.fn(async () => blocks),
          } as never,
        },
      );
      const participants = [
        { profileId: 'me' },
        { profileId: 'bob' },
        { profileId: 'dan' },
      ];

      await gateway.handleChatConversationUpdated({
        participants,
        payload: {
          id: 'c1',
          participants: [
            { profileId: 'me', profile: { id: 'me', username: 'me' } },
            { profileId: 'bob', profile: { id: 'bob', username: 'bob' } },
            { profileId: 'dan', profile: { id: 'dan', username: 'dan' } },
          ],
        },
      } as never);
      await gateway.handleChatMessageEdited({
        participants,
        payload: {
          id: 'm1',
          senderId: 'bob',
          sender: { id: 'bob', username: 'bob' },
        },
      } as never);

      const sent = (room: string, event: string) =>
        emits.find((e) => e.room === room && e.event === event)?.payload;
      expect(
        sent('user:me', 'conversation_updated').participants[1].profile,
      ).toEqual({ id: 'bob', username: null, unavailable: true });
      expect(
        sent('user:dan', 'conversation_updated').participants[1].profile
          .username,
      ).toBe('bob');
      expect(
        sent('user:bob', 'conversation_updated').participants[0].profile
          .unavailable,
      ).toBe(true);
      expect(sent('user:me', 'message_edited').sender).toEqual({
        id: 'bob',
        username: null,
        unavailable: true,
      });
      expect(sent('user:dan', 'message_edited').sender.username).toBe('bob');
    });

    it('dispatches chat.message.edited to participants', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      await gateway.handleChatMessageEdited({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'm-1', content: 'edited' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('message_edited', {
        id: 'm-1',
        content: 'edited',
      });
    });

    it('dispatches chat.conversation.updated to participants', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      await gateway.handleChatConversationUpdated({
        participants: [{ profileId: 'p-1' }],
        payload: { id: 'c-1', title: 'New Title' },
      });

      expect(mockTo).toHaveBeenCalledWith('user:p-1');
      expect(mockEmit).toHaveBeenCalledWith('conversation_updated', {
        id: 'c-1',
        title: 'New Title',
      });
    });

    it('dispatches chat.conversation.deleted to participants', async () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const gateway = gatewayWithServer({ to: mockTo });

      await gateway.handleChatConversationDeleted({
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

    it('initializes conversationIds Set in handleSendReaction once the reaction is recorded', async () => {
      const mockChatRealtime = {
        addReaction: vi.fn().mockResolvedValue({
          success: true,
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
    });

    it('handles invalid questions and unauthorized clear_question', async () => {
      const mockLiveRealtime = {
        incrementViewerCount: vi.fn(),
        decrementViewerCount: vi.fn(),
        isStreamHostOrOnAirGuest: vi.fn().mockResolvedValue(false),
        getChatAuthor: vi.fn(),
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
