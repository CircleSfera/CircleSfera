import * as crypto from 'node:crypto';
import { Inject, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  isOriginAllowed,
  parseAllowedOrigins,
} from '../common/config/origin.config.js';
import { CorrelationContext } from '../common/correlation/correlation.context.js';
import { WebrtcSignalingService } from '../webrtc/webrtc-signaling.service.js';
import type {
  CallAcceptDeclineDto,
  CallHangupDto,
  CallInviteDto,
  CallSignalDto,
  LiveAskQuestionDto,
  LiveChatDto,
  LiveHighlightQuestionDto,
  LivePinCommentDto,
  LiveReactionDto,
  LiveSetGoalDto,
  LiveStreamIdDto,
  MarkReadDto,
  SendReactionDto,
  TypingEventDto,
} from './dto/socket-events.dto.js';
import { ChatRealtimeService } from './services/chat-realtime.service.js';
import { LiveRealtimeService } from './services/live-realtime.service.js';
import {
  type JwtPayload,
  SocketAuthService,
  type SocketAuthUser,
} from './services/socket-auth.service.js';
import { SocketPresenceService } from './services/socket-presence.service.js';

export type { JwtPayload, SocketAuthUser };

export interface SocketWithAuth extends Socket {
  data: {
    user: SocketAuthUser;
    conversationIds?: Set<string>;
    correlationId?: string;
    // Live streams this socket has joined via live:join, tracked separately
    // from Socket.IO's own room membership because rooms are already left
    // by the time the 'disconnect' event fires, so handleDisconnect can't
    // read client.rooms to reconcile abandoned viewer counts (RT-004).
    liveStreamIds?: Set<string>;
  };
}

@WebSocketGateway({
  cors: {
    credentials: true,
  },
  namespace: 'events',
  path: '/socket.io',
  maxHttpBufferSize: 128 * 1024, // 128 KB max packet size
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AppGateway.name);

  constructor(
    @Inject(SocketAuthService)
    private readonly socketAuthService: SocketAuthService,
    @Inject(SocketPresenceService)
    private readonly socketPresenceService: SocketPresenceService,
    @Inject(ChatRealtimeService)
    private readonly chatRealtimeService: ChatRealtimeService,
    @Inject(WebrtcSignalingService)
    private readonly webrtcSignalingService: WebrtcSignalingService,
    @Inject(LiveRealtimeService)
    private readonly liveRealtimeService: LiveRealtimeService,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const origin = client.handshake?.headers?.origin;
      if (origin && typeof origin === 'string') {
        const corsOrigin = this.configService?.get<string>('CORS_ORIGIN');
        const isProd =
          this.configService?.get<string>('NODE_ENV') === 'production';
        const allowedOrigins = parseAllowedOrigins(corsOrigin, isProd);

        if (!isOriginAllowed(origin, allowedOrigins)) {
          this.logger.warn(
            `Cross-Site WebSocket Hijacking guard: dropped connection from unauthorized origin: ${origin}`,
          );
          client.disconnect(true);
          return;
        }
      }

      const auth = await this.socketAuthService.authenticate(client);

      const rawCorrelation =
        client.handshake?.headers?.['x-correlation-id'] ||
        client.handshake?.headers?.['x-request-id'] ||
        (client.handshake?.auth as Record<string, unknown> | undefined)
          ?.correlationId;

      const correlationId =
        typeof rawCorrelation === 'string' && rawCorrelation.trim() !== ''
          ? rawCorrelation.trim()
          : CorrelationContext.generateId();

      (client as SocketWithAuth).data = {
        user: auth.user,
        conversationIds: auth.conversationIds,
        correlationId,
      };

      const profileId = auth.user.profileId;

      await CorrelationContext.run(correlationId, async () => {
        await client.join(`user:${profileId}`);

        const followRooms =
          await this.socketPresenceService.getFollowPresenceRooms(profileId);
        if (followRooms.length > 0) {
          await client.join(followRooms);
        }

        await client.join(`presence:${profileId}`);

        await this.socketPresenceService.setUserOnline(auth.user.sub);

        this.server.to(`presence:${profileId}`).emit('user_status', {
          profileId,
          isOnline: true,
        });
      });

      this.logger.log(
        `User connected: ${auth.user.sub} (profile ${profileId})`,
      );
    } catch (e: unknown) {
      this.logger.error(
        `Socket connection failed: ${e instanceof Error ? e.message : 'Unknown'}`,
      );
      if (typeof client.disconnect === 'function') {
        client.disconnect();
      }
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = (client as SocketWithAuth).data?.user;
      if (user) {
        const { lastSeenAt } = await this.socketPresenceService.setUserOffline(
          user.sub,
        );

        this.server.to(`presence:${user.profileId}`).emit('user_status', {
          profileId: user.profileId,
          isOnline: false,
          lastSeenAt: lastSeenAt.toISOString(),
        });

        if (this.webrtcSignalingService) {
          const terminatedCalls =
            this.webrtcSignalingService.handleUserDisconnect(user.profileId);
          for (const call of terminatedCalls) {
            if (call.state === 'RINGING') {
              this.server.to(`user:${call.peerId}`).emit('call:declined');
            } else {
              this.server.to(`user:${call.peerId}`).emit('call:ended');
            }
          }
        }

        // Reconcile viewer counts for live streams this socket never sent
        // live:leave for (tab closed, network drop) — otherwise the count
        // stays permanently inflated (RT-004).
        const liveStreamIds = (client as SocketWithAuth).data?.liveStreamIds;
        if (liveStreamIds?.size) {
          for (const streamId of liveStreamIds) {
            const count =
              await this.liveRealtimeService.decrementViewerCount(streamId);
            this.server.to(`live:${streamId}`).emit('live:viewer_left', {
              profileId: user.profileId,
              viewerCount: count,
            });
            this.server
              .to(`live:${streamId}`)
              .emit('live:viewer_count_update', {
                streamId,
                viewerCount: count,
              });
          }
        }

        this.logger.log(
          `User disconnected: ${user.sub} (profile ${user.profileId})`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update online status for disconnecting user: ${
          error instanceof Error ? error.message : 'Unknown'
        }`,
      );
    }
  }

  // Real-time Notifications
  sendNotification(
    profileId: string,
    notification: {
      id: string;
      type: string;
      content: string;
      [key: string]: unknown;
    },
  ) {
    this.server.to(`user:${profileId}`).emit('notification', notification);
  }

  // Connected sockets for this gateway.
  // Nest injects the `/events` Namespace into `@WebSocketServer()`, so
  // `server.sockets` is already a `Map<id, Socket>`. Treating it as the
  // Root `Server` (`server.sockets.sockets`) throws and 500s after a
  // Message has already been persisted.
  private connectedSockets(): Iterable<SocketWithAuth> {
    const sockets = this.server?.sockets as
      | Map<string, SocketWithAuth>
      | { sockets?: Map<string, SocketWithAuth> }
      | undefined;
    if (!sockets) return [];
    if (sockets instanceof Map) return sockets.values();
    return sockets.sockets?.values() ?? [];
  }

  // Helper to dynamically grant a user in-memory access to a new conversation room.
  addConversationToSocket(profileId: string, conversationId: string) {
    for (const client of this.connectedSockets()) {
      if (client.data?.user?.profileId === profileId) {
        if (!client.data.conversationIds) {
          client.data.conversationIds = new Set();
        }
        client.data.conversationIds.add(conversationId);
      }
    }
  }

  // Chat Actions (Typing, Reactions, etc.)
  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @MessageBody() payload: TypingEventDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.conversationId || !payload?.recipientId) return;
    if (!client.data?.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('user_typing', {
      profileId: client.data.user.profileId,
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @MessageBody() payload: TypingEventDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.conversationId || !payload?.recipientId) return;
    if (!client.data?.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('user_stopped_typing', {
      profileId: client.data.user.profileId,
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('send_reaction')
  async handleSendReaction(
    @MessageBody()
    payload: SendReactionDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.messageId ||
      !payload?.conversationId ||
      !payload?.reaction ||
      typeof payload.reaction !== 'string' ||
      payload.reaction.length > 32
    ) {
      return;
    }

    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const hasConversationAccess =
      client.data.conversationIds?.has(payload.conversationId) ?? false;

    const result = await this.chatRealtimeService.addReaction(
      payload.messageId,
      payload.conversationId,
      callerProfileId,
      payload.reaction,
      hasConversationAccess,
    );

    if (!result.success || !result.reactionRecord) return;

    if (result.grantConversationAccess) {
      if (!client.data.conversationIds) {
        client.data.conversationIds = new Set();
      }
      client.data.conversationIds.add(payload.conversationId);
    }

    const eventPayload = {
      messageId: payload.messageId,
      profileId: callerProfileId,
      reaction: result.reactionRecord.reaction,
      id: result.reactionRecord.id,
    };

    result.participantProfileIds?.forEach((pId) => {
      this.server.to(`user:${pId}`).emit('message_reaction', eventPayload);
    });
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @MessageBody() payload: MarkReadDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.conversationId || !payload?.recipientId) return;
    if (!client.data?.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('messages_read', {
      conversationId: payload.conversationId,
      profileId: client.data.user.profileId,
      readAt: new Date().toISOString(),
    });
  }

  // WebRTC VOIP Signaling

  @SubscribeMessage('call:invite')
  @SubscribeMessage('call:initiate')
  async handleCallInvite(
    @MessageBody()
    payload: CallInviteDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const callerId = client.data.user?.profileId;
    const targetId = payload?.targetId || payload?.recipientId;
    if (!callerId || !targetId) return;

    const callType = payload?.type || 'audio';

    const authResult =
      await this.webrtcSignalingService.authorizeAndInitiateCall(
        callerId,
        targetId,
        callType,
      );

    if (!authResult.ok) {
      this.logger.warn(
        `Call invite from ${callerId} to ${targetId} rejected: ${authResult.reason}`,
      );
      if (authResult.reason === 'BUSY') {
        client.emit('call:declined', { reason: 'busy' });
      }
      return;
    }

    const callerProfile =
      await this.webrtcSignalingService.getCallerProfile(callerId);

    this.logger.log(
      `Call invite from ${callerId} to ${targetId} (${callType}) [callId: ${authResult.session?.callId}]`,
    );

    this.server.to(`user:${targetId}`).emit('call:incoming', {
      callId: authResult.session?.callId,
      caller: callerProfile,
      type: callType,
      signalData: null,
    });
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(
    @MessageBody() payload: CallAcceptDeclineDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const receiverId = client.data.user?.profileId;
    if (!receiverId || !payload?.callerId) return;

    const auth = this.webrtcSignalingService.authorizeAndAcceptCall(
      receiverId,
      payload.callerId,
    );

    if (!auth.ok) {
      this.logger.warn(
        `Unauthorized call:accept attempt by ${receiverId} for caller ${payload.callerId}`,
      );
      return;
    }

    this.logger.log(
      `Call accepted by ${receiverId} (Caller: ${payload.callerId})`,
    );
    this.server.to(`user:${payload.callerId}`).emit('call:accepted', {
      receiverId,
    });
  }

  @SubscribeMessage('call:decline')
  handleCallDecline(
    @MessageBody() payload: CallAcceptDeclineDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const receiverId = client.data.user?.profileId;
    if (!receiverId || !payload?.callerId) return;

    const auth = this.webrtcSignalingService.authorizeAndDeclineCall(
      receiverId,
      payload.callerId,
    );

    if (!auth.ok) {
      this.logger.warn(
        `Unauthorized call:decline attempt by ${receiverId} for caller ${payload.callerId}`,
      );
      return;
    }

    this.logger.log(
      `Call declined by ${receiverId} (Caller: ${payload.callerId})`,
    );
    this.server.to(`user:${payload.callerId}`).emit('call:declined');
  }

  @SubscribeMessage('call:signal')
  handleCallSignal(
    @MessageBody() payload: CallSignalDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const senderId = client.data.user?.profileId;
    if (!senderId || !payload?.targetId || !payload?.signal) return;

    try {
      const signalStr =
        typeof payload.signal === 'string'
          ? payload.signal
          : JSON.stringify(payload.signal);
      if (signalStr.length > 32768) {
        this.logger.warn(
          `Dropped oversized call:signal payload from ${senderId}`,
        );
        return;
      }
    } catch {
      return;
    }

    const isAuthorized = this.webrtcSignalingService.authorizeSignal(
      senderId,
      payload.targetId,
    );

    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized call:signal from ${senderId} to ${payload.targetId} dropped`,
      );
      return;
    }

    this.server.to(`user:${payload.targetId}`).emit('call:signal', {
      signal: payload.signal,
      fromId: senderId,
    });
  }

  @SubscribeMessage('call:hangup')
  handleCallHangup(
    @MessageBody() payload: CallHangupDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const senderId = client.data.user?.profileId;
    if (!senderId || !payload?.targetId) return;

    const endResult = this.webrtcSignalingService.authorizeAndEndCall(
      senderId,
      payload.targetId,
    );

    if (!endResult.ok) {
      this.logger.warn(
        `Unauthorized call:hangup from ${senderId} for target ${payload.targetId}`,
      );
      return;
    }

    this.server.to(`user:${payload.targetId}`).emit('call:ended');
  }

  // Live Streams

  @SubscribeMessage('live:join')
  async handleLiveJoin(
    @MessageBody() payload: LiveStreamIdDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      typeof payload.streamId !== 'string' ||
      payload.streamId.length > 64
    )
      return;
    const profileId = client.data?.user?.profileId;
    if (!profileId) return;

    await client.join(`live:${payload.streamId}`);
    if (!client.data.liveStreamIds) {
      client.data.liveStreamIds = new Set();
    }
    client.data.liveStreamIds.add(payload.streamId);

    const count = await this.liveRealtimeService.incrementViewerCount(
      payload.streamId,
    );

    this.server.to(`live:${payload.streamId}`).emit('live:viewer_joined', {
      profileId,
      viewerCount: count,
    });

    this.server
      .to(`live:${payload.streamId}`)
      .emit('live:viewer_count_update', {
        streamId: payload.streamId,
        viewerCount: count,
      });
  }

  @SubscribeMessage('live:leave')
  async handleLiveLeave(
    @MessageBody() payload: LiveStreamIdDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      typeof payload.streamId !== 'string' ||
      payload.streamId.length > 64
    )
      return;
    const profileId = client.data?.user?.profileId;
    if (!profileId) return;

    await client.leave(`live:${payload.streamId}`);
    client.data.liveStreamIds?.delete(payload.streamId);

    const count = await this.liveRealtimeService.decrementViewerCount(
      payload.streamId,
    );

    this.server.to(`live:${payload.streamId}`).emit('live:viewer_left', {
      profileId,
      viewerCount: count,
    });

    this.server
      .to(`live:${payload.streamId}`)
      .emit('live:viewer_count_update', {
        streamId: payload.streamId,
        viewerCount: count,
      });
  }

  @SubscribeMessage('live:chat')
  async handleLiveChat(
    @MessageBody() payload: LiveChatDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      !payload?.message ||
      typeof payload.streamId !== 'string' ||
      typeof payload.message !== 'string'
    ) {
      return;
    }
    const cleanMessage = payload.message.trim().slice(0, 500);
    if (!cleanMessage) return;

    const userProfile = await this.liveRealtimeService.getUserProfile(
      client.data?.user?.sub,
    );

    if (userProfile) {
      this.server.to(`live:${payload.streamId}`).emit('live:chat_message', {
        id: crypto.randomUUID(),
        profile: userProfile,
        message: cleanMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Shared policy for stream host/co-host-only live actions — the one
  // authoritative gate-and-log implementation for pin/unpin comment,
  // highlight/clear question and set goal (AUTHZ-002). Returns the caller's
  // profileId when authorized, or null (after logging) when not.
  private async requireStreamHostOrCoHost(
    client: SocketWithAuth,
    streamId: string,
    eventName: string,
  ): Promise<string | null> {
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return null;

    const isAuthorized = await this.liveRealtimeService.isStreamHostOrCoHost(
      streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized ${eventName} attempt by profile ${callerProfileId} on stream ${streamId}`,
      );
      return null;
    }
    return callerProfileId;
  }

  @SubscribeMessage('live:pin_comment')
  async handleLivePinComment(
    @MessageBody()
    payload: LivePinCommentDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      !payload?.commentId ||
      !payload?.message ||
      typeof payload.message !== 'string'
    ) {
      return;
    }

    const callerProfileId = await this.requireStreamHostOrCoHost(
      client,
      payload.streamId,
      'live:pin_comment',
    );
    if (!callerProfileId) return;

    const cleanMessage = payload.message.trim().slice(0, 500);
    const cleanUsername =
      typeof payload.username === 'string'
        ? payload.username.slice(0, 100)
        : '';

    this.server.to(`live:${payload.streamId}`).emit('live:comment_pinned', {
      commentId: payload.commentId,
      message: cleanMessage,
      username: cleanUsername,
      avatar: payload.avatar,
      pinnedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('live:unpin_comment')
  async handleLiveUnpinComment(
    @MessageBody() payload: LiveStreamIdDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.streamId || typeof payload.streamId !== 'string') return;

    const callerProfileId = await this.requireStreamHostOrCoHost(
      client,
      payload.streamId,
      'live:unpin_comment',
    );
    if (!callerProfileId) return;

    this.server.to(`live:${payload.streamId}`).emit('live:comment_unpinned', {
      streamId: payload.streamId,
    });
  }

  @SubscribeMessage('live:heart')
  async handleLiveHeart(
    @MessageBody() payload: LiveReactionDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.streamId || typeof payload.streamId !== 'string') return;
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const reaction =
      typeof payload.reaction === 'string' && payload.reaction.length <= 32
        ? payload.reaction
        : '❤️';
    this.server.to(`live:${payload.streamId}`).emit('live:heart_received', {
      profileId: callerProfileId,
      reaction,
    });
  }

  @SubscribeMessage('live:send_reaction')
  async handleLiveSendReaction(
    @MessageBody() payload: LiveReactionDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.streamId || typeof payload.streamId !== 'string') return;
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const reaction =
      typeof payload.reaction === 'string' && payload.reaction.length <= 32
        ? payload.reaction
        : '🔥';
    this.server.to(`live:${payload.streamId}`).emit('live:reaction_received', {
      profileId: callerProfileId,
      reaction,
    });
  }

  // Phase 2: Q&A and Live Goals

  @SubscribeMessage('live:ask_question')
  async handleLiveAskQuestion(
    @MessageBody()
    payload: LiveAskQuestionDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      !payload?.question ||
      typeof payload.streamId !== 'string' ||
      typeof payload.question !== 'string'
    ) {
      return;
    }
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const cleanQuestion = payload.question.trim().slice(0, 500);
    if (!cleanQuestion) return;
    const cleanUsername =
      typeof payload.username === 'string'
        ? payload.username.slice(0, 100)
        : '';

    this.server.to(`live:${payload.streamId}`).emit('live:question_asked', {
      id: crypto.randomUUID(),
      question: cleanQuestion,
      username: cleanUsername,
      avatar: payload.avatar,
      createdAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('live:highlight_question')
  async handleLiveHighlightQuestion(
    @MessageBody()
    payload: LiveHighlightQuestionDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      !payload?.questionId ||
      !payload?.question ||
      typeof payload.streamId !== 'string' ||
      typeof payload.question !== 'string'
    ) {
      return;
    }
    const callerProfileId = await this.requireStreamHostOrCoHost(
      client,
      payload.streamId,
      'live:highlight_question',
    );
    if (!callerProfileId) return;

    const cleanQuestion = payload.question.trim().slice(0, 500);
    const cleanUsername =
      typeof payload.username === 'string'
        ? payload.username.slice(0, 100)
        : '';

    this.server
      .to(`live:${payload.streamId}`)
      .emit('live:question_highlighted', {
        id: payload.questionId,
        question: cleanQuestion,
        username: cleanUsername,
        avatar: payload.avatar,
      });
  }

  @SubscribeMessage('live:clear_question')
  async handleLiveClearQuestion(
    @MessageBody() payload: LiveStreamIdDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!payload?.streamId || typeof payload.streamId !== 'string') return;
    const callerProfileId = await this.requireStreamHostOrCoHost(
      client,
      payload.streamId,
      'live:clear_question',
    );
    if (!callerProfileId) return;

    this.server.to(`live:${payload.streamId}`).emit('live:question_cleared');
  }

  @SubscribeMessage('live:set_goal')
  async handleLiveSetGoal(
    @MessageBody() payload: LiveSetGoalDto,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (
      !payload?.streamId ||
      !payload?.title ||
      typeof payload.streamId !== 'string' ||
      typeof payload.title !== 'string' ||
      typeof payload.target !== 'number' ||
      payload.target <= 0 ||
      payload.target > 1000000
    ) {
      return;
    }

    const callerProfileId = await this.requireStreamHostOrCoHost(
      client,
      payload.streamId,
      'live:set_goal',
    );
    if (!callerProfileId) return;

    const cleanTitle = payload.title.trim().slice(0, 100);

    this.server.to(`live:${payload.streamId}`).emit('live:goal_set', {
      title: cleanTitle,
      target: Math.floor(payload.target),
      current: 0,
    });
  }

  // --- EDA Domain Event Listeners ---

  @OnEvent('chat.message.sent')
  handleChatMessageSent(event: {
    participants: { profileId: string }[];
    payload: {
      conversationId: string;
      senderId?: string;
      isLocked?: boolean;
      [key: string]: unknown;
    };
  }) {
    event.participants?.forEach((p) => {
      this.addConversationToSocket(p.profileId, event.payload.conversationId);
      // A message just sent can't have been unlocked yet by anyone but the
      // sender — mirror GetMessagesQuery's redaction so the realtime channel
      // can't leak locked-message content/media past the paywall.
      const payload =
        event.payload.isLocked && p.profileId !== event.payload.senderId
          ? {
              ...event.payload,
              content: 'This message is locked. Pay to unlock.',
              url: null,
              standardUrl: null,
              thumbnailUrl: null,
              mediaType: null,
              voiceUrl: null,
            }
          : event.payload;
      this.server.to(`user:${p.profileId}`).emit('receiveMessage', payload);
    });
  }

  @OnEvent('chat.message.deleted')
  handleChatMessageDeleted(event: {
    participants: { profileId: string }[];
    payload: { messageId: string; [key: string]: unknown };
  }) {
    event.participants?.forEach((p) => {
      this.server
        .to(`user:${p.profileId}`)
        .emit('message_deleted', event.payload);
    });
  }

  @OnEvent('chat.message.edited')
  handleChatMessageEdited(event: {
    participants: { profileId: string }[];
    payload: { messageId: string; [key: string]: unknown };
  }) {
    event.participants?.forEach((p) => {
      this.server
        .to(`user:${p.profileId}`)
        .emit('message_edited', event.payload);
    });
  }

  @OnEvent('chat.conversation.updated')
  handleChatConversationUpdated(event: {
    participants: { profileId: string }[];
    payload: { conversationId: string; [key: string]: unknown };
  }) {
    event.participants?.forEach((p) => {
      this.server
        .to(`user:${p.profileId}`)
        .emit('conversation_updated', event.payload);
    });
  }

  @OnEvent('chat.conversation.deleted')
  handleChatConversationDeleted(event: {
    participants: { profileId: string }[];
    payload: { conversationId: string; [key: string]: unknown };
  }) {
    event.participants?.forEach((p) => {
      this.server
        .to(`user:${p.profileId}`)
        .emit('conversationDeleted', event.payload);
    });
  }

  @OnEvent('chat.conversation.created')
  handleChatConversationCreated(event: {
    conversation: {
      id: string;
      participants: { profileId: string }[];
    };
  }) {
    event.conversation?.participants?.forEach((p) => {
      this.addConversationToSocket(p.profileId, event.conversation.id);
    });
  }

  @OnEvent('notification.dispatched')
  handleNotificationDispatched(event: {
    recipientId: string;
    notification: {
      id: string;
      type: string;
      content: string;
      [key: string]: unknown;
    };
  }) {
    if (event?.recipientId && event?.notification) {
      this.sendNotification(event.recipientId, event.notification);
    }
  }

  @OnEvent('user.session.terminate')
  handleUserSessionTerminate(event: {
    userId: string;
    profileId?: string;
    reason?: string;
  }) {
    const { userId, profileId, reason = 'Account state changed' } = event;
    this.logger.log(
      `Terminating realtime sessions for user=${userId} profile=${profileId} (reason: ${reason})`,
    );

    if (profileId) {
      this.server
        ?.to(`user:${profileId}`)
        ?.emit('session_terminated', { reason });
      if (typeof this.server?.in === 'function') {
        const room = this.server.in(`user:${profileId}`);
        if (typeof room?.disconnectSockets === 'function') {
          room.disconnectSockets(true);
        }
      }
    }

    for (const client of this.connectedSockets()) {
      const authData = client.data;
      if (
        authData?.user?.sub === userId ||
        (profileId && authData?.user?.profileId === profileId)
      ) {
        client.emit('session_terminated', { reason });
        client.disconnect(true);
      }
    }
  }
}
