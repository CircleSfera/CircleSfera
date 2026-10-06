import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  async execute(
    adminId: string,
    postId: string,
    // Staff note for the author; without one the email uses the generic
    // reason in the author's language.
    reason?: string,
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        profile: { select: { userId: true, username: true, fullName: true } },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    await this.logAdminAction.execute(
      adminId,
      AdminAction.DELETE_POST,
      'post',
      postId,
    );

    const deletedPost = await this.prisma.post.delete({
      where: { id: postId },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: post.profile?.userId },
      select: { email: true },
    });

    if (user?.email) {
      await this.emailService.sendPostRemovedEmail(
        user.email,
        post.profile?.fullName || post.profile?.username,
        reason,
      );
    }

    return deletedPost;
  }
}
