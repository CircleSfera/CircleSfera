import { Inject, Injectable, Logger } from '@nestjs/common';
import { canEnterStreamRoom } from '../../live/live-audience.js';
import { isStreamHostOrOnAirGuest } from '../../live/live-authorization.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ChatUserProfile {
  id: string;
  username: string;
  avatar: string | null;
}

@Injectable()
export class LiveRealtimeService {
  private readonly logger = new Logger(LiveRealtimeService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Whether this Profile may be in the room of this live. */
  canEnterRoom(streamId: string, profileId: string): Promise<boolean> {
    return canEnterStreamRoom(this.prisma, streamId, profileId);
  }

  /**
   * Whether this Profile is on the Elite Creator or Business plan, which is
   * what the plan reactions of a broadcast need.
   */
  async hasElitePlan(profileId: string): Promise<boolean> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { verificationLevel: true },
    });
    return (
      profile?.verificationLevel === 'ELITE' ||
      profile?.verificationLevel === 'BUSINESS'
    );
  }

  /**
   * Increments viewer count in the database for an active stream.
   */
  async incrementViewerCount(streamId: string): Promise<number> {
    try {
      const updatedStream = await this.prisma.liveStream.update({
        where: { id: streamId },
        data: { viewerCount: { increment: 1 } },
        select: { viewerCount: true },
      });
      return updatedStream.viewerCount;
    } catch (error) {
      this.logger.warn(
        `Failed to increment viewer count for ${streamId}: ${
          error instanceof Error ? error.message : 'Unknown'
        }`,
      );
      return 1;
    }
  }

  /**
   * Decrements viewer count in the database for an active stream.
   * The floor at 0 is enforced by the conditional updateMany itself (not by
   * clamping the return value), so the column can never go negative under
   * concurrent decrements.
   */
  async decrementViewerCount(streamId: string): Promise<number> {
    try {
      await this.prisma.liveStream.updateMany({
        where: { id: streamId, viewerCount: { gt: 0 } },
        data: { viewerCount: { decrement: 1 } },
      });
      const stream = await this.prisma.liveStream.findUnique({
        where: { id: streamId },
        select: { viewerCount: true },
      });
      return stream?.viewerCount ?? 0;
    } catch (error) {
      this.logger.warn(
        `Failed to decrement viewer count for ${streamId}: ${
          error instanceof Error ? error.message : 'Unknown'
        }`,
      );
      return 0;
    }
  }

  /**
   * Whether the given profile is the host of a stream, or a guest on air
   * in it.
   */
  async isStreamHostOrOnAirGuest(
    streamId: string,
    profileId: string,
  ): Promise<boolean> {
    if (!streamId || !profileId) return false;
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: {
        hostId: true,
        guests: { where: { profileId }, select: { status: true } },
      },
    });
    if (!stream) return false;
    return isStreamHostOrOnAirGuest(
      stream,
      profileId,
      stream.guests[0]?.status,
    );
  }

  /**
   * Retrieves profile display data for chat messages.
   */
  async getUserProfile(userId: string): Promise<ChatUserProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true },
    });

    const profile = user?.profiles[0];
    if (!profile) return null;

    return {
      id: profile.id,
      username: profile.username,
      avatar: profile.avatar,
    };
  }
}
