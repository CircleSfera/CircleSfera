import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAppealDto } from './dto/create-appeal.dto.js';
import { UpdateAppealDto } from './dto/update-appeal.dto.js';

@Injectable()
export class AppealsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAppealDto) {
    return this.prisma.appeal.create({
      data: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });
  }

  async findMyUserAppeals(userId: string) {
    return this.prisma.appeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin Methods
  async findAll() {
    return this.prisma.appeal.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { username: true, fullName: true, avatar: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    return appeal;
  }

  async update(id: string, dto: UpdateAppealDto) {
    // Determine if we need to reactivate account or restore post based on approval
    const appeal = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const updatedAppeal = await tx.appeal.update({
        where: { id },
        data: {
          status: dto.status,
          adminNotes: dto.adminNotes,
        },
      });

      if (dto.status === 'APPROVED') {
        if (appeal.targetType === 'ACCOUNT_BAN') {
          // Restore User Account
          await tx.user.update({
            where: { id: appeal.userId },
            data: { isActive: true },
          });
        }
        // If targetType is POST_REMOVAL, we would restore the post
        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          await tx.post.update({
            where: { id: appeal.targetId },
            data: { moderationStatus: 'VISIBLE' },
          });
        }
      }

      return updatedAppeal;
    });
  }
}
