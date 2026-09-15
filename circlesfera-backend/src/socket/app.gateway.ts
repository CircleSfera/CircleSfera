import * as crypto from 'node:crypto';
import {
  forwardRef,
  Inject,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as cookie from 'cookie';
import type { Server, Socket } from 'socket.io';
import { AddReactionUseCase } from '../chat/use-cases/messages/add-reaction.use-case.js';
import { ACCESS_TOKEN_COOKIE } from '../common/config/cookie.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
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

interface JwtPayload {
  sub: string;
  email: string;
}

interface SocketAuthUser extends JwtPayload {
  profileId: string;
}

export interface SocketWithAuth extends Socket {
  data: {
    user: SocketAuthUser;
    conversationIds?: Set<string>;
  };
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: 'events',
  path: '/socket.io',
  maxHttpBufferSize: 128 * 1024, // 128 KB max packet size (INPUT-002)
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AppGateway.name);

  constructor(
    @Inject(JwtService) private jwtService: JwtService,
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(forwardRef(() => AddReactionUseCase))
    private addReactionUseCase: AddReactionUseCase,
    @Inject(WebrtcSignalingService)
    private webrtcSignalingService: WebrtcSignalingService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException('No token found');
      }

      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      // Validate user in DB (matching REST jwt.strategy.ts)
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { profiles: true },
      });

      if (!user?.isActive) {
        throw new UnauthorizedException(
          'User not found or account deactivated',
        );
      }

      if (
        user.profiles[0]?.suspendedUntil &&
        user.profiles[0]?.suspendedUntil > new Date()
      ) {
        throw new UnauthorizedException('Account suspended');
      }

      const profileId = user.profiles[0]?.id;
      if (!profileId) {
        throw new UnauthorizedException('Profile not found');
      }

      const userConvs = await this.prisma.participant.findMany({
        where: { profileId, deletedAt: null },
        select: { conversationId: true },
      });

      (client as SocketWithAuth).data = {
        user: { ...payload, profileId },
        conversationIds: new Set(userConvs.map((c) => c.conversationId)),
      };

      await client.join(`user:${profileId}`);

      const following = await this.prisma.follow.findMany({
        where: { followerId: profileId },
        select: { followingId: true },
      });
      const followRooms = following.map((f) => `presence:${f.followingId}`);
      if (followRooms.length > 0) {
        await client.join(followRooms);
      }

      await client.join(`presence:${profileId}`);

      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { isOnline: true },
      });

      this.server.to(`presence:${profileId}`).emit('user_status', {
        profileId,
        isOnline: true,
      });

      this.logger.log(`User connected: ${payload.sub} (profile ${profileId})`);
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
        // Only update if user still exists (prevents crash on stale sessions after DB wipe)
        await this.prisma.user.update({
          where: { id: user.sub },
          data: { isOnline: false, lastSeenAt: new Date() },
        });

        // Notify anyone tracking this user
        this.server.to(`presence:${user.profileId}`).emit('user_status', {
          profileId: user.profileId,
          isOnline: false,
          lastSeenAt: new Date().toISOString(),
        });

        // Clean up any ongoing or ringing WebRTC calls for the disconnected user (RT-003)
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

    const isMember = client.data.conversationIds?.has(payload.conversationId);
    if (!isMember) {
      const participant = await this.prisma.participant.findUnique({
        where: {
          conversationId_profileId: {
            conversationId: payload.conversationId,
            profileId: callerProfileId,
          },
        },
      });
      if (!participant || participant.deletedAt) {
        this.logger.warn(
          `Unauthorized send_reaction attempt by profile ${callerProfileId} in conversation ${payload.conversationId}`,
        );
        return;
      }
      if (!client.data.conversationIds) {
        client.data.conversationIds = new Set();
      }
      client.data.conversationIds.add(payload.conversationId);
    }

    try {
      const reactionRecord = await this.addReactionUseCase.execute(
        payload.messageId,
        callerProfileId,
        payload.reaction,
      );

      const eventPayload = {
        messageId: payload.messageId,
        profileId: callerProfileId,
        reaction: reactionRecord.reaction,
        id: reactionRecord.id,
      };

      // Get all participants of this conversation to notify them
      const conv = await this.prisma.conversation.findUnique({
        where: { id: payload.conversationId },
        select: { participants: { select: { profileId: true } } },
      });

      if (conv) {
        conv.participants.forEach((p) => {
          this.server
            .to(`user:${p.profileId}`)
            .emit('message_reaction', eventPayload);
        });
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to add reaction to message ${payload.messageId}: ${
          err instanceof Error ? err.message : 'Unknown'
        }`,
      );
    }
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

    // Server-side authorization: relationship (blocks, active conversation) and state (neither busy)
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

    const callerProfile = await this.prisma.profile.findUnique({
      where: { id: callerId },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatar: true,
      },
    });

    this.logger.log(
      `Call invite from ${callerId} to ${targetId} (${callType}) [callId: ${authResult.session?.callId}]`,
    );

    this.server.to(`user:${targetId}`).emit('call:incoming', {
      callId: authResult.session?.callId,
      caller: callerProfile
        ? {
            id: callerProfile.id,
            profile: {
              username: callerProfile.username,
              fullName: callerProfile.fullName ?? undefined,
              avatar: callerProfile.avatar,
            },
          }
        : null,
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

    // Server-side authorization: valid RINGING call session where caller is payload.callerId
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

    // Server-side authorization: valid RINGING call session where caller is payload.callerId
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

    // Server-side authorization for every signaling event (RT-003)
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

    // Forward WebRTC signaling data (OFFER, ANSWER, ICE Candidates)
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

  // Helper for live stream ownership checks
  private async isStreamHostOrCoHost(
    streamId: string,
    profileId: string,
  ): Promise<boolean> {
    if (!streamId || !profileId) return false;
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { hostId: true, coHostId: true },
    });
    if (!stream) return false;
    return stream.hostId === profileId || stream.coHostId === profileId;
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

    // Update DB viewer count & broadcast
    const updatedStream = await this.prisma.liveStream
      .update({
        where: { id: payload.streamId },
        data: { viewerCount: { increment: 1 } },
        select: { viewerCount: true },
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to increment viewer count for ${payload.streamId}: ${
            error instanceof Error ? error.message : 'Unknown'
          }`,
        );
        return null;
      });

    const count = updatedStream?.viewerCount ?? 1;

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

    const updatedStream = await this.prisma.liveStream
      .update({
        where: { id: payload.streamId },
        data: { viewerCount: { decrement: 1 } },
        select: { viewerCount: true },
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to decrement viewer count for ${payload.streamId}: ${
            error instanceof Error ? error.message : 'Unknown'
          }`,
        );
        return null;
      });

    const count = Math.max(0, updatedStream?.viewerCount ?? 0);

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

    const user = await this.prisma.user.findUnique({
      where: { id: client.data?.user?.sub },
      include: { profiles: true },
    });

    if (user?.profiles[0]) {
      this.server.to(`live:${payload.streamId}`).emit('live:chat_message', {
        id: crypto.randomUUID(),
        profile: {
          id: user.profiles[0].id,
          username: user.profiles[0].username,
          avatar: user.profiles[0].avatar,
        },
        message: cleanMessage,
        timestamp: new Date().toISOString(),
      });
    }
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

    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const isAuthorized = await this.isStreamHostOrCoHost(
      payload.streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized live:pin_comment attempt by profile ${callerProfileId} on stream ${payload.streamId}`,
      );
      return;
    }

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

    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const isAuthorized = await this.isStreamHostOrCoHost(
      payload.streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized live:unpin_comment attempt by profile ${callerProfileId} on stream ${payload.streamId}`,
      );
      return;
    }

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
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const isAuthorized = await this.isStreamHostOrCoHost(
      payload.streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized live:highlight_question attempt by profile ${callerProfileId} on stream ${payload.streamId}`,
      );
      return;
    }

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
    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const isAuthorized = await this.isStreamHostOrCoHost(
      payload.streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized live:clear_question attempt by profile ${callerProfileId} on stream ${payload.streamId}`,
      );
      return;
    }

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

    const callerProfileId = client.data?.user?.profileId;
    if (!callerProfileId) return;

    const isAuthorized = await this.isStreamHostOrCoHost(
      payload.streamId,
      callerProfileId,
    );
    if (!isAuthorized) {
      this.logger.warn(
        `Unauthorized live:set_goal attempt by profile ${callerProfileId} on stream ${payload.streamId}`,
      );
      return;
    }

    const cleanTitle = payload.title.trim().slice(0, 100);

    this.server.to(`live:${payload.streamId}`).emit('live:goal_set', {
      title: cleanTitle,
      target: Math.floor(payload.target),
      current: 0,
    });
  }

  // --- EDA Domain Event Listeners (BE-003) ---

  @OnEvent('chat.message.sent')
  handleChatMessageSent(event: {
    participants: { profileId: string }[];
    payload: { conversationId: string; [key: string]: unknown };
  }) {
    event.participants?.forEach((p) => {
      this.addConversationToSocket(p.profileId, event.payload.conversationId);
      this.server
        .to(`user:${p.profileId}`)
        .emit('receiveMessage', event.payload);
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

  // Extract JWT token from socket handshake.
  // Priority: 1) HTTP-only cookie 2) Authorization Bearer header
  private extractToken(client: Socket): string | undefined {
    const cookieHeader = client.handshake.headers.cookie;

    if (cookieHeader) {
      try {
        const cookies = cookie.parse(cookieHeader);

        if (cookies[ACCESS_TOKEN_COOKIE]) {
          return cookies[ACCESS_TOKEN_COOKIE];
        }
      } catch (parseError: unknown) {
        this.logger.error(
          `Failed to parse socket handshake cookies: ${
            parseError instanceof Error ? parseError.message : 'Unknown'
          }`,
        );
      }
    }

    // 2. Fall back to Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    return undefined;
  }
}
