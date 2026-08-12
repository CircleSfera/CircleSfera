import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeleteStoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, storyId: string) {
    await this.prisma.story.delete({ where: { id: storyId } });
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_STORY,
      'story',
      storyId,
    );
  }
}
