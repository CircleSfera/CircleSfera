import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

// Hides a hashtag from people, or shows it again. The posts that use it are
// not touched: search stops offering the hashtag and its page lists nothing.
@Injectable()
export class SetHashtagHiddenUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, hashtagId: string, hidden: boolean) {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { id: hashtagId },
      select: { id: true, tag: true, isHidden: true },
    });
    if (!hashtag) throw new NotFoundException('Hashtag not found');
    // Asked for what it already is: nothing changes and nothing is logged.
    if (hashtag.isHidden === hidden)
      return { id: hashtag.id, isHidden: hidden };

    await this.prisma.hashtag.update({
      where: { id: hashtag.id },
      data: { isHidden: hidden },
    });
    await this.logAdminAction.execute(
      adminId,
      hidden ? AdminAction.CONTENT_RESTRICTED : AdminAction.CONTENT_RESTORED,
      'hashtag',
      hashtag.id,
      `#${hashtag.tag}`,
    );

    return { id: hashtag.id, isHidden: hidden };
  }
}
