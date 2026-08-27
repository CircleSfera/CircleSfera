import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class MarkAsReadUseCase {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async execute(conversationId: string, profileId: string) {
    await this.prisma.participant.updateMany({
      where: {
        conversationId,
        profileId,
      },
      data: {
        lastReadAt: new Date(),
      },
    });
  }
}
