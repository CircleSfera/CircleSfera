import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Service for managing a profile's close friends list (add/remove toggle). */
@Injectable()
export class CloseFriendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Get all close friends for a profile.
   * @param profileId - The current profile's ID
   */
  async getCloseFriends(profileId: string) {
    const closeFriends = await this.prisma.closeFriend.findMany({
      where: { profileId },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            standardUrl: true,
            thumbnailUrl: true,
            userId: true,
          },
        },
      },
    });

    return closeFriends.map((cf) => ({
      ...cf.friend,
      isCloseFriend: true,
    }));
  }

  /**
   * Toggle a profile's close-friend status on or off.
   * @param profileId - The current profile's ID
   * @param friendId - The friend profile to toggle
   * @returns `{ isCloseFriend: boolean }`
   * @throws BadRequestException if profileId equals friendId
   * @throws NotFoundException if friend profile does not exist
   */
  async toggleCloseFriend(profileId: string, friendId: string) {
    if (profileId === friendId) {
      throw new BadRequestException('Cannot add yourself to close friends');
    }

    const friend = await this.prisma.profile.findUnique({
      where: { id: friendId },
      select: { id: true },
    });
    if (!friend) {
      throw new NotFoundException('Friend profile not found');
    }

    const existing = await this.prisma.closeFriend.findUnique({
      where: {
        profileId_friendId: {
          profileId,
          friendId,
        },
      },
    });

    if (existing) {
      await this.prisma.closeFriend.delete({
        where: { id: existing.id },
      });
      return { isCloseFriend: false };
    }

    await this.prisma.closeFriend.create({
      data: {
        profileId,
        friendId,
      },
    });
    return { isCloseFriend: true };
  }
}
