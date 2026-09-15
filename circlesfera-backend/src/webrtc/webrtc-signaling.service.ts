import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export type CallState = 'RINGING' | 'ACTIVE';

export interface CallSession {
  callId: string;
  callerId: string;
  calleeId: string;
  type: 'audio' | 'video';
  state: CallState;
  createdAt: number;
  expiresAt: number;
}

export interface CallAuthorizationResult {
  ok: boolean;
  reason?:
    | 'SELF_CALL'
    | 'BLOCKED'
    | 'NO_CONVERSATION'
    | 'BUSY'
    | 'INVALID_PARTICIPANTS';
  session?: CallSession;
}

@Injectable()
export class WebrtcSignalingService {
  private readonly logger = new Logger(WebrtcSignalingService.name);

  // In-memory call sessions keyed by callId
  private readonly sessions = new Map<string, CallSession>();

  // ProfileId -> callId mapping (a profile can only participate in at most one active call)
  private readonly userCalls = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authorizes and initiates a new call from caller to callee.
   * Validates:
   * 1. Participants are valid and not identical.
   * 2. Neither participant is blocked by the other.
   * 3. An active 1-on-1 conversation exists between them.
   * 4. Neither participant is currently busy in an existing call.
   */
  async authorizeAndInitiateCall(
    callerId: string,
    calleeId: string,
    type: 'audio' | 'video',
  ): Promise<CallAuthorizationResult> {
    this.pruneExpiredSessions();

    if (!callerId || !calleeId || callerId === calleeId) {
      this.logger.warn(
        `Call rejected: invalid participants (${callerId} -> ${calleeId})`,
      );
      return { ok: false, reason: 'SELF_CALL' };
    }

    // Check if either participant is already in a call (ringing or active)
    if (this.userCalls.has(callerId) || this.userCalls.has(calleeId)) {
      this.logger.warn(
        `Call rejected: participant busy (caller: ${this.userCalls.has(callerId)}, callee: ${this.userCalls.has(calleeId)})`,
      );
      return { ok: false, reason: 'BUSY' };
    }

    // Relationship check: Check block status between caller and callee
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: callerId, blockedId: calleeId },
          { blockerId: calleeId, blockedId: callerId },
        ],
      },
      select: { id: true },
    });

    if (block) {
      this.logger.warn(
        `Call blocked: block relationship exists between ${callerId} and ${calleeId}`,
      );
      return { ok: false, reason: 'BLOCKED' };
    }

    // Relationship check: Verify active 1-on-1 conversation exists
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { profileId: callerId, deletedAt: null } } },
          { participants: { some: { profileId: calleeId, deletedAt: null } } },
        ],
      },
      select: { id: true },
    });

    if (!conversation) {
      this.logger.warn(
        `Call blocked: No active 1-on-1 conversation between ${callerId} and ${calleeId}`,
      );
      return { ok: false, reason: 'NO_CONVERSATION' };
    }

    // Authorization passed: Register ringing call session
    const callId = crypto.randomUUID();
    const now = Date.now();
    const session: CallSession = {
      callId,
      callerId,
      calleeId,
      type,
      state: 'RINGING',
      createdAt: now,
      expiresAt: now + 60 * 1000, // 60-second ringing timeout
    };

    this.sessions.set(callId, session);
    this.userCalls.set(callerId, callId);
    this.userCalls.set(calleeId, callId);

    return { ok: true, session };
  }

  /**
   * Authorizes call acceptance by the callee.
   * State check: Must have an active RINGING call session where caller matches payload.
   */
  authorizeAndAcceptCall(
    receiverId: string,
    callerId: string,
  ): { ok: boolean; session?: CallSession } {
    this.pruneExpiredSessions();

    const callId = this.userCalls.get(receiverId);
    if (!callId) {
      this.logger.warn(
        `Call accept rejected: receiver ${receiverId} is not in any call`,
      );
      return { ok: false };
    }

    const session = this.sessions.get(callId);
    if (
      !session ||
      session.calleeId !== receiverId ||
      session.callerId !== callerId ||
      session.state !== 'RINGING'
    ) {
      this.logger.warn(
        `Call accept rejected: invalid state or caller mismatch for receiver ${receiverId}`,
      );
      return { ok: false };
    }

    // Transition to ACTIVE
    session.state = 'ACTIVE';
    session.expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4-hour max active duration

    return { ok: true, session };
  }

  /**
   * Authorizes call decline by the callee.
   * State check: Must have an active RINGING call session where caller matches payload.
   */
  authorizeAndDeclineCall(
    receiverId: string,
    callerId: string,
  ): { ok: boolean } {
    this.pruneExpiredSessions();

    const callId = this.userCalls.get(receiverId);
    if (!callId) {
      return { ok: false };
    }

    const session = this.sessions.get(callId);
    if (
      !session ||
      session.calleeId !== receiverId ||
      session.callerId !== callerId ||
      session.state !== 'RINGING'
    ) {
      return { ok: false };
    }

    this.deleteSession(callId);
    return { ok: true };
  }

  /**
   * Authorizes WebRTC signaling (offers, answers, ICE candidates).
   * Validates:
   * 1. Sender is in a call session.
   * 2. Target is the authorized peer of that session.
   * 3. Session state is ACTIVE (or RINGING for initial offer).
   */
  authorizeSignal(senderId: string, targetId: string): boolean {
    this.pruneExpiredSessions();

    const callId = this.userCalls.get(senderId);
    if (!callId) {
      this.logger.warn(
        `Call signal rejected: sender ${senderId} has no active call`,
      );
      return false;
    }

    const session = this.sessions.get(callId);
    if (!session) {
      return false;
    }

    const isPeer =
      (session.callerId === senderId && session.calleeId === targetId) ||
      (session.calleeId === senderId && session.callerId === targetId);

    if (!isPeer) {
      this.logger.warn(
        `Call signal rejected: target ${targetId} is not the authorized peer of ${senderId}`,
      );
      return false;
    }

    if (session.state !== 'ACTIVE' && session.state !== 'RINGING') {
      this.logger.warn(
        `Call signal rejected: call session state is ${session.state}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Authorizes hanging up an active/ringing call.
   * Terminates the session and returns the peerId to notify.
   */
  authorizeAndEndCall(
    senderId: string,
    targetId: string,
  ): { ok: boolean; peerId?: string } {
    this.pruneExpiredSessions();

    const callId = this.userCalls.get(senderId);
    if (!callId) {
      return { ok: false };
    }

    const session = this.sessions.get(callId);
    if (!session) {
      return { ok: false };
    }

    const isPeer =
      (session.callerId === senderId && session.calleeId === targetId) ||
      (session.calleeId === senderId && session.callerId === targetId);

    if (!isPeer) {
      return { ok: false };
    }

    this.deleteSession(callId);
    return { ok: true, peerId: targetId };
  }

  /**
   * Cleans up any call session associated with a disconnected user.
   * Returns a list of peers to notify with their call states.
   */
  handleUserDisconnect(
    profileId: string,
  ): { peerId: string; state: CallState }[] {
    const callId = this.userCalls.get(profileId);
    if (!callId) {
      return [];
    }

    const session = this.sessions.get(callId);
    if (!session) {
      this.userCalls.delete(profileId);
      return [];
    }

    const peerId =
      session.callerId === profileId ? session.calleeId : session.callerId;
    const state = session.state;

    this.deleteSession(callId);
    return [{ peerId, state }];
  }

  /**
   * Retrieves current call session for a user (for tests or diagnostics).
   */
  getSessionForUser(profileId: string): CallSession | undefined {
    this.pruneExpiredSessions();
    const callId = this.userCalls.get(profileId);
    if (!callId) return undefined;
    return this.sessions.get(callId);
  }

  private deleteSession(callId: string): void {
    const session = this.sessions.get(callId);
    if (session) {
      this.userCalls.delete(session.callerId);
      this.userCalls.delete(session.calleeId);
      this.sessions.delete(callId);
    }
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [callId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.deleteSession(callId);
      }
    }
  }
}
