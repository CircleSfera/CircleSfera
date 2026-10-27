import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { emailForProfile } from '../../../../common/auth/sign-in-lookup.js';
import { setModerationStatus } from '../../../../common/policies/moderation-decision.js';
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
    const { removedPost, author } = await this.remove(adminId, postId, reason);

    if (author) {
      await this.emailService.sendPostRemovedEmail(
        author.email,
        author.name,
        reason,
      );
    }

    return removedPost;
  }

  // Removes the post and writes it in the audit log, and says who its
  // author is without writing to them: whoever removes several tells each
  // author once. The post is not deleted: it is kept, shown to nobody, for
  // the six months its author has to appeal, and erased after.
  async remove(adminId: string, postId: string, reason?: string) {
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

    const { profile: _author, ...kept } = post;
    const removed = await setModerationStatus(
      this.prisma,
      'POST',
      postId,
      'REMOVED',
      reason,
    );

    // About a Profile: to the email that Profile signs in with.
    const email = await emailForProfile(this.prisma, post.profileId);

    return {
      removedPost: { ...kept, ...removed },
      author: email
        ? { email, name: post.profile?.fullName || post.profile?.username }
        : null,
    };
  }
}
