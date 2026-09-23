import { Inject, Injectable, Logger } from '@nestjs/common';
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
   * Checks whether the given profile is the host or co-host of a stream.
   */
  async isStreamHostOrCoHost(
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
