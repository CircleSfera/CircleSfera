import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { setModerationStatus } from '../../../../common/policies/moderation-decision.js';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { tellAuthorOfRemoval } from '../../../utils/tell-author-of-removal.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeleteCommentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  // The comment is not deleted: it is kept, shown to nobody, its author
  // included, for six months, and erased after. The author is told in the
  // app; a comment cannot be appealed, so the notice has no way to appeal.
  async execute(adminId: string, commentId: string) {
    const removed = await setModerationStatus(
      this.prisma,
      'COMMENT',
      commentId,
      'REMOVED',
    );
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_COMMENT,
      'comment',
      commentId,
    );
    await tellAuthorOfRemoval(
      this.prisma,
      (notice) => this.notifications.create(notice),
      adminId,
      { kind: 'COMMENT', id: commentId, authorProfileId: removed.profileId },
    );
  }
}
