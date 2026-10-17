import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAction, IllegalNoticeStatus } from '@prisma/client';
import { toSupportedLocale } from '../common/constants/locale.constants.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateIllegalNoticeDto } from './dto/create-illegal-notice.dto.js';
import type { DecideIllegalNoticeDto } from './dto/decide-illegal-notice.dto.js';

// The reference a notifier is given: the start of the id, enough to find it.
export const noticeReference = (id: string) => id.slice(0, 8).toUpperCase();

@Injectable()
export class IllegalNoticesService {
  private readonly logger = new Logger(IllegalNoticesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  // Only content on CircleSfera can be notified here.
  isOwnAddress(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const own = new URL(
        this.config.get<string>('FRONTEND_URL') || 'https://circlesfera.com',
      ).hostname.toLowerCase();
      const bare = own.replace(/^www\./, '');
      return host === bare || host.endsWith(`.${bare}`);
    } catch {
      return false;
    }
  }

  async create(dto: CreateIllegalNoticeDto) {
    const childAbuse = dto.childAbuse === true;
    const notice = await this.prisma.illegalContentNotice.create({
      data: {
        contentUrl: dto.contentUrl.trim(),
        explanation: dto.explanation.trim(),
        childAbuse,
        notifierName: dto.notifierName?.trim() || null,
        notifierEmail: dto.notifierEmail?.trim().toLowerCase() || null,
        goodFaith: true,
        locale: toSupportedLocale(dto.locale),
      },
    });
    const reference = noticeReference(notice.id);
    if (notice.notifierEmail) {
      await this.email
        .sendNoticeReceivedEmail(
          notice.notifierEmail,
          notice.locale,
          notice.contentUrl,
          reference,
        )
        .catch((e) => this.logger.error('Notice receipt not sent', e));
    }
    return { reference };
  }

  async list(status?: IllegalNoticeStatus) {
    return this.prisma.illegalContentNotice.findMany({
      where: status ? { status } : {},
      // Child sexual abuse material first, then the oldest waiting.
      orderBy: [{ childAbuse: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });
  }

  async decide(adminId: string, id: string, dto: DecideIllegalNoticeDto) {
    const notice = await this.prisma.illegalContentNotice.findUnique({
      where: { id },
    });
    if (!notice) throw new NotFoundException('Notice not found');
    const decided = await this.prisma.illegalContentNotice.update({
      where: { id },
      data: {
        status: IllegalNoticeStatus[dto.outcome],
        decision: dto.reasons.trim(),
        decidedAt: new Date(),
        decidedById: adminId,
      },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: AdminAction.REPORT_RESOLVED,
        targetType: 'illegal_notice',
        targetId: id,
        details: `Notice decided: ${dto.outcome}`,
      },
    });
    if (decided.notifierEmail) {
      await this.email
        .sendNoticeDecidedEmail(
          decided.notifierEmail,
          decided.locale,
          decided.contentUrl,
          dto.outcome === 'ACTIONED',
          decided.decision ?? '',
        )
        .catch((e) => this.logger.error('Notice decision not sent', e));
    }
    return decided;
  }
}
