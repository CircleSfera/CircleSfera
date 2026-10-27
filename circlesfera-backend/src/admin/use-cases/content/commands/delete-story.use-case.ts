import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { setModerationStatus } from '../../../../common/policies/moderation-decision.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeleteStoryUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  // The story is not deleted: it is kept, shown to nobody, its author
  // included, for six months, and erased after.
  async execute(adminId: string, storyId: string) {
    await setModerationStatus(this.prisma, 'STORY', storyId, 'REMOVED');
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_STORY,
      'story',
      storyId,
    );
  }
}
