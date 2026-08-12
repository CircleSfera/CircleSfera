import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { EmailService } from '../../../../email/email.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class DeletePostUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, postId: string) {
    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_POST,
      'post',
      postId,
    );

    const deletedPost = await this.prisma.post.delete({
      where: { id: postId },
      include: { user: { include: { profile: true } } },
    });

    if (deletedPost.user?.email) {
      await this.emailService.sendModerationEmail(
        deletedPost.user.email,
        deletedPost.user.profile?.username || 'Usuario',
        'eliminada',
        'Publicación',
        'Incumplimiento de nuestras políticas de contenido',
      );
    }

    return deletedPost;
  }
}
