import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, commentId: string) {
    await this.prisma.comment.delete({ where: { id: commentId } });
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_COMMENT,
      'comment',
      commentId,
    );
  }
}
