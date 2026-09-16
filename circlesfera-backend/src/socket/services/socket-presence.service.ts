import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class SocketPresenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Retrieves presence room IDs for all profiles that the user follows.
   */
  async getFollowPresenceRooms(profileId: string): Promise<string[]> {
    const following = await this.prisma.follow.findMany({
      where: { followerId: profileId },
      select: { followingId: true },
    });
    return following.map((f) => `presence:${f.followingId}`);
  }

  /**
   * Sets a user's presence state to online.
   */
  async setUserOnline(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isOnline: true },
    });
  }

  /**
   * Sets a user's presence state to offline and updates their lastSeenAt timestamp.
   */
  async setUserOffline(userId: string): Promise<{ lastSeenAt: Date }> {
    const lastSeenAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { isOnline: false, lastSeenAt },
    });
    return { lastSeenAt };
  }
}
