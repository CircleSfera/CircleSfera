import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Service for managing a user's close friends list (add/remove toggle). */
@Injectable()
export class CloseFriendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Get all close friends for a user, including their profiles.
   * @param userId - The current user's ID
   */
  async getCloseFriends(userId: string) {
    const closeFriends = await this.prisma.closeFriend.findMany({
      where: { userId },
    });

    const friendIds = closeFriends.map((cf) => cf.friendId);

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: friendIds },
      },
      include: {
        profile: true,
      },
    });

    return users.map((user) => ({
      ...user,
      isCloseFriend: true,
    }));
  }

  /**
   * Toggle a user's close-friend status on or off.
   * @param userId - The current user's ID
   * @param friendId - The friend to toggle
   * @returns `{ isCloseFriend: boolean }`
   * @throws BadRequestException if userId equals friendId
   */
  async toggleCloseFriend(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Cannot add yourself to close friends');
    }

    const existing = await this.prisma.closeFriend.findUnique({
      where: {
        userId_friendId: {
          userId,
          friendId,
        },
      },
    });

    if (existing) {
      await this.prisma.closeFriend.delete({
        where: { id: existing.id },
      });
      return { isCloseFriend: false };
    } else {
      await this.prisma.closeFriend.create({
        data: {
          userId,
          friendId,
        },
      });
      return { isCloseFriend: true };
    }
  }
}
