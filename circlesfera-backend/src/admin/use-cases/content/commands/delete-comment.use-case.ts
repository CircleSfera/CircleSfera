import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { setModerationStatus } from '../../../../common/policies/moderation-decision.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  // The comment is not deleted: it is kept, shown to nobody, its author
  // included, for six months, and erased after.
  async execute(adminId: string, commentId: string) {
    await setModerationStatus(this.prisma, 'COMMENT', commentId, 'REMOVED');
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_COMMENT,
      'comment',
      commentId,
    );
  }
}
