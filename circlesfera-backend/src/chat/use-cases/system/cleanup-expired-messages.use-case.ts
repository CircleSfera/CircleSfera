import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class CleanupExpiredMessagesUseCase {
  private readonly logger = new Logger(CleanupExpiredMessagesUseCase.name);

  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async execute() {
    try {
      const deleted = await this.prisma.message.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} expired messages.`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired messages', error);
    }
  }
}
