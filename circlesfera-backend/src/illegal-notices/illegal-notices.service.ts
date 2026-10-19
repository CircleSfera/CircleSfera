import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminAction, IllegalNoticeStatus, type Prisma } from '@prisma/client';
import { toSupportedLocale } from '../common/constants/locale.constants.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateIllegalNoticeDto } from './dto/create-illegal-notice.dto.js';
import type { DecideIllegalNoticeDto } from './dto/decide-illegal-notice.dto.js';

// The reference a notifier is given: the start of the id, enough to find it.
export const noticeReference = (id: string) => id.slice(0, 8).toUpperCase();

export const NOTICE_PAGE_DEFAULT = 30;
export const NOTICE_PAGE_MAX = 50;

// Where a page ends: the last notice's place in the order of its tab.
type NoticeCursor = { childAbuse: boolean; at: Date; id: string };

const encodeNoticeCursor = (c: NoticeCursor) =>
  Buffer.from(
    JSON.stringify({ c: c.childAbuse, at: c.at.toISOString(), id: c.id }),
  ).toString('base64url');

// A malformed cursor reads as none: the tab starts from the top.
const decodeNoticeCursor = (raw: string): NoticeCursor | null => {
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const at = new Date(p?.at);
    if (
      typeof p?.c !== 'boolean' ||
      typeof p?.id !== 'string' ||
      Number.isNaN(at.getTime())
    ) {
      return null;
    }
    return { childAbuse: p.c, at, id: p.id };
  } catch {
    return null;
  }
};

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

  // One page of a tab, most recent first. Waiting notices of child sexual
  // abuse material come before every other waiting notice; a decided tab is
  // in the order of the decisions. The cursor names the last notice of the
  // page before, so every notice can be reached however many there are;
  // nextCursor is null on the last page.
  async listPage(
    status: IllegalNoticeStatus,
    cursor?: string,
    limit: number = NOTICE_PAGE_DEFAULT,
  ) {
    const take = Math.min(Math.max(limit, 1), NOTICE_PAGE_MAX);
    const waiting = status === IllegalNoticeStatus.RECEIVED;
    const field = waiting ? 'createdAt' : 'decidedAt';
    const after = cursor ? decodeNoticeCursor(cursor) : null;

    const where: Prisma.IllegalContentNoticeWhereInput = { status };
    if (after) {
      const withinGroup: Prisma.IllegalContentNoticeWhereInput[] = [
        { [field]: { lt: after.at } },
        { [field]: after.at, id: { lt: after.id } },
      ];
      where.OR = waiting
        ? [
            ...withinGroup.map((w) => ({ ...w, childAbuse: after.childAbuse })),
            // Past the last notice of child abuse come all the others.
            ...(after.childAbuse ? [{ childAbuse: false }] : []),
          ]
        : withinGroup;
    }

    const rows = await this.prisma.illegalContentNotice.findMany({
      where,
      orderBy: [
        ...(waiting ? [{ childAbuse: 'desc' as const }] : []),
        { [field]: 'desc' as const },
        { id: 'desc' as const },
      ],
      take: take + 1,
    });

    const items = rows.slice(0, take);
    const last = items.at(-1);
    const lastAt = last?.[field];
    return {
      items,
      nextCursor:
        rows.length > take && last && lastAt
          ? encodeNoticeCursor({
              childAbuse: last.childAbuse,
              at: lastAt,
              id: last.id,
            })
          : null,
    };
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
