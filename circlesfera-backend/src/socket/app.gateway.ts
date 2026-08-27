import * as crypto from 'node:crypto';
import {
  forwardRef,
  Inject,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { ACCESS_TOKEN_COOKIE } from '../common/config/cookie.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface JwtPayload {
  sub: string;
  email: string;
}

export interface SocketWithAuth extends Socket {
  data: {
    user: JwtPayload;
    conversationIds?: Set<string>;
  };
}

// @ts-nocheck
import { AddReactionUseCase } from '../chat/use-cases/messages/add-reaction.use-case.js';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: 'events',
  path: '/socket.io',
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

      // Attach user to socket
      (client as SocketWithAuth).data.user = payload;

      // Load all conversation IDs for the user in memory to prevent N+1 queries during chat events
      const userConvs = await this.prisma.participant.findMany({
        where: { profileId: payload.sub, deletedAt: null },
        select: { conversationId: true },
      });
      (client as SocketWithAuth).data.conversationIds = new Set(
        userConvs.map((c) => c.conversationId),
      );

      // Join user to their personal room
      await client.join(`user:${payload.sub}`);

      // Join rooms of everyone the user follows to receive their status updates
      const following = await this.prisma.follow.findMany({
        where: { followerId: payload.sub },
        select: { followingId: true },
      });
      const followRooms = following.map((f) => `presence:${f.followingId}`);
      if (followRooms.length > 0) {
        await client.join(followRooms);
      }

      // Join our own presence room so others can track us
      await client.join(`presence:${payload.sub}`);

      // Update online status
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { isOnline: true },
      });

      // Notify anyone tracking this user (in a single emit to the presence room)
      this.server.to(`presence:${payload.sub}`).emit('user_status', {
        profileId: payload.sub,
        isOnline: true,
      });

      this.logger.log(`User connected: ${payload.sub}`);
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
        this.server.to(`presence:${user.sub}`).emit('user_status', {
          profileId: user.sub,
          isOnline: false,
          lastSeenAt: new Date().toISOString(),
        });

        this.logger.log(`User disconnected: ${user.sub}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to update online status for disconnecting user: ${
          error instanceof Error ? error.message : 'Unknown'
        }`,
      );
    }
  }

  // --- Real-time Notifications ---
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

  /**
   * Connected sockets for this gateway.
   *
   * Nest injects the `/events` Namespace into `@WebSocketServer()`, so
   * `server.sockets` is already a `Map<id, Socket>`. Treating it as the
   * root `Server` (`server.sockets.sockets`) throws and 500s after a
   * message has already been persisted.
   */
  private connectedSockets(): Iterable<SocketWithAuth> {
    const sockets = this.server?.sockets as
      | Map<string, SocketWithAuth>
      | { sockets?: Map<string, SocketWithAuth> }
      | undefined;
    if (!sockets) return [];
    if (sockets instanceof Map) return sockets.values();
    return sockets.sockets?.values() ?? [];
  }

  /**
   * Helper to dynamically grant a user in-memory access to a new conversation room.
   */
  addConversationToSocket(profileId: string, conversationId: string) {
    for (const client of this.connectedSockets()) {
      if (client.data?.user?.sub === profileId) {
        if (!client.data.conversationIds) {
          client.data.conversationIds = new Set();
        }
        client.data.conversationIds.add(conversationId);
      }
    }
  }

  // --- Chat Actions (Typing, Reactions, etc.) ---
  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @MessageBody() payload: { conversationId: string; recipientId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!client.data.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('user_typing', {
      profileId: client.data.user.sub,
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @MessageBody() payload: { conversationId: string; recipientId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!client.data.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('user_stopped_typing', {
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('send_reaction')
  async handleSendReaction(
    @MessageBody()
    payload: {
      messageId: string;
      conversationId: string;
      reaction: string;
    },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const reactionRecord = await this.addReactionUseCase.execute(
      payload.messageId,
      client.data.user.sub,
      payload.reaction,
    );

    const eventPayload = {
      messageId: payload.messageId,
      profileId: client.data.user.sub,
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
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @MessageBody() payload: { conversationId: string; recipientId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    if (!client.data.conversationIds?.has(payload.conversationId)) return;

    this.server.to(`user:${payload.recipientId}`).emit('messages_read', {
      conversationId: payload.conversationId,
      profileId: client.data.user.sub,
      readAt: new Date().toISOString(),
    });
  }

  // --- WebRTC VOIP Signaling ---

  @SubscribeMessage('call:invite')
  @SubscribeMessage('call:initiate')
  async handleCallInvite(
    @MessageBody()
    payload: {
      recipientId?: string;
      targetId?: string;
      type: 'audio' | 'video';
    },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const callerId = client.data.user.sub;
    const targetId = payload.targetId || payload.recipientId;
    if (!targetId) return;

    // Security: Only allow calling if they have an active 1-on-1 conversation
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { profileId: callerId } } },
          { participants: { some: { profileId: targetId } } },
        ],
      },
    });

    if (!conversation) {
      this.logger.warn(
        `Call blocked: No active conversation between ${callerId} and ${targetId}`,
      );
      return;
    }

    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: {
        id: true,
        profile: {
          select: { username: true, fullName: true, avatar: true },
        },
      },
    });

    this.logger.log(
      `Call invite from ${callerId} to ${targetId} (${payload.type})`,
    );

    this.server.to(`user:${targetId}`).emit('call:incoming', {
      caller: caller,
      type: payload.type,
      signalData: null, // Initial invitation, signaling will follow in call:signal
    });
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(
    @MessageBody() payload: { callerId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const receiverId = client.data.user.sub;
    this.logger.log(
      `Call accepted by ${receiverId} (Caller: ${payload.callerId})`,
    );
    this.server.to(`user:${payload.callerId}`).emit('call:accepted', {
      receiverId,
    });
  }

  @SubscribeMessage('call:decline')
  handleCallDecline(@MessageBody() payload: { callerId: string }) {
    this.server.to(`user:${payload.callerId}`).emit('call:declined');
  }

  @SubscribeMessage('call:signal')
  handleCallSignal(
    @MessageBody() payload: { targetId: string; signal: unknown },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    // Transparently forward WebRTC signaling data (OFFER, ANSWER, ICE Candidates)
    this.server.to(`user:${payload.targetId}`).emit('call:signal', {
      signal: payload.signal,
      fromId: client.data.user.sub,
    });
  }

  @SubscribeMessage('call:hangup')
  handleCallHangup(@MessageBody() payload: { targetId: string }) {
    this.server.to(`user:${payload.targetId}`).emit('call:ended');
  }

  // --- Live Streams ---

  @SubscribeMessage('live:join')
  async handleLiveJoin(
    @MessageBody() payload: { streamId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
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
      profileId: client.data.user.sub,
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
    @MessageBody() payload: { streamId: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
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
      profileId: client.data.user.sub,
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
    @MessageBody() payload: { streamId: string; message: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: client.data.user.sub },
      include: { profiles: true },
    });

    if (user?.profiles[0]) {
      this.server.to(`live:${payload.streamId}`).emit('live:chat_message', {
        id: crypto.randomUUID(),
        profile: {
          id: user.id,
          username: user.profiles[0].username,
          avatar: user.profiles[0].avatar,
        },
        message: payload.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage('live:pin_comment')
  async handleLivePinComment(
    @MessageBody()
    payload: {
      streamId: string;
      commentId: string;
      message: string;
      username: string;
      avatar?: string;
    },
  ) {
    this.server.to(`live:${payload.streamId}`).emit('live:comment_pinned', {
      commentId: payload.commentId,
      message: payload.message,
      username: payload.username,
      avatar: payload.avatar,
      pinnedAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('live:unpin_comment')
  async handleLiveUnpinComment(@MessageBody() payload: { streamId: string }) {
    this.server.to(`live:${payload.streamId}`).emit('live:comment_unpinned', {
      streamId: payload.streamId,
    });
  }

  @SubscribeMessage('live:heart')
  async handleLiveHeart(
    @MessageBody() payload: { streamId: string; reaction?: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const reaction = payload.reaction || '❤️';
    this.server.to(`live:${payload.streamId}`).emit('live:heart_received', {
      profileId: client.data.user.sub,
      reaction,
    });
  }

  @SubscribeMessage('live:send_reaction')
  async handleLiveSendReaction(
    @MessageBody() payload: { streamId: string; reaction: string },
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    this.server.to(`live:${payload.streamId}`).emit('live:reaction_received', {
      profileId: client.data.user.sub,
      reaction: payload.reaction || '🔥',
    });
  }

  // --- Phase 2: Q&A and Live Goals ---

  @SubscribeMessage('live:ask_question')
  async handleLiveAskQuestion(
    @MessageBody() payload: {
      streamId: string;
      question: string;
      username: string;
      avatar?: string;
    },
  ) {
    this.server.to(`live:${payload.streamId}`).emit('live:question_asked', {
      id: crypto.randomUUID(),
      question: payload.question,
      username: payload.username,
      avatar: payload.avatar,
      createdAt: new Date().toISOString(),
    });
  }

  @SubscribeMessage('live:highlight_question')
  async handleLiveHighlightQuestion(
    @MessageBody() payload: {
      streamId: string;
      questionId: string;
      question: string;
      username: string;
      avatar?: string;
    },
  ) {
    this.server
      .to(`live:${payload.streamId}`)
      .emit('live:question_highlighted', {
        id: payload.questionId,
        question: payload.question,
        username: payload.username,
        avatar: payload.avatar,
      });
  }

  @SubscribeMessage('live:clear_question')
  async handleLiveClearQuestion(@MessageBody() payload: { streamId: string }) {
    this.server.to(`live:${payload.streamId}`).emit('live:question_cleared');
  }

  @SubscribeMessage('live:set_goal')
  async handleLiveSetGoal(
    @MessageBody() payload: { streamId: string; title: string; target: number },
  ) {
    this.server.to(`live:${payload.streamId}`).emit('live:goal_set', {
      title: payload.title,
      target: payload.target,
      current: 0, // Goals start at 0
    });
  }

  /**
   * Extract JWT token from socket handshake.
   * Priority: 1) HTTP-only cookie  2) Authorization Bearer header
   */
  private extractToken(client: Socket): string | undefined {
    const cookieHeader = client.handshake.headers.cookie;

    if (cookieHeader) {
      try {
        const cookies = cookie.parse(cookieHeader);

        if (cookies[ACCESS_TOKEN_COOKIE]) {
          return cookies[ACCESS_TOKEN_COOKIE];
        }
      } catch (parseError) {
        this.logger.error(
          'Failed to parse socket handshake cookies',
          parseError,
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
