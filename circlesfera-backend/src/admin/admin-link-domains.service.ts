import * as net from 'node:net';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  STAFF_LIST_PAGE_DEFAULT,
  STAFF_LIST_PAGE_MAX,
} from './dto/staff-list-page.dto.js';
import { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';

/** A domain as staff type it, as the server writes a link's host. */
export function normaliseDomain(raw: string): string {
  const text = raw.trim().toLowerCase();
  let host = '';
  try {
    host = new URL(text.includes('://') ? text : `https://${text}`).hostname;
  } catch {
    throw new BadRequestException('DOMAIN_INVALID');
  }
  host = host.replace(/\.$/, '');
  if (!host.includes('.') || net.isIP(host.replace(/^\[|\]$/g, ''))) {
    throw new BadRequestException('DOMAIN_INVALID');
  }
  return host;
}

const DOMAIN_SELECT = {
  id: true,
  domain: true,
  reason: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

// The domain a page of the list ended on, or null when the cursor is not
// one this service wrote.
function decodeDomainCursor(cursor: string): string | null {
  const domain = Buffer.from(cursor, 'base64url').toString('utf8');
  return /^[a-z0-9._-]{1,253}$/.test(domain) ? domain : null;
}

/**
 * The domains no link on a story may point to, nor any of their subdomains,
 * kept by staff with the content permission. Each change is audited.
 */
@Injectable()
export class AdminLinkDomainsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  list(search?: string) {
    return this.prisma.blockedLinkDomain.findMany({
      where: search?.trim()
        ? { domain: { contains: search.trim().toLowerCase() } }
        : undefined,
      orderBy: { domain: 'asc' },
      take: 200,
      select: DOMAIN_SELECT,
    });
  }

  // One page of the list, in alphabetical order. The cursor names the last
  // domain of the page before, so the next page starts strictly after it
  // however long the list is; a malformed cursor starts from the top.
  // nextCursor is null on the last page.
  async listPage(
    search?: string,
    cursor?: string,
    limit: number = STAFF_LIST_PAGE_DEFAULT,
  ) {
    const take = Math.min(Math.max(limit, 1), STAFF_LIST_PAGE_MAX);
    const after = cursor ? decodeDomainCursor(cursor) : null;
    const text = search?.trim().toLowerCase();
    const rows = await this.prisma.blockedLinkDomain.findMany({
      where: {
        domain: {
          ...(text && { contains: text }),
          ...(after !== null && { gt: after }),
        },
      },
      orderBy: { domain: 'asc' },
      take: take + 1,
      select: DOMAIN_SELECT,
    });
    const items = rows.slice(0, take);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > take && last
          ? Buffer.from(last.domain).toString('base64url')
          : null,
    };
  }

  async block(adminId: string, rawDomain: string, reason?: string) {
    const domain = normaliseDomain(rawDomain);
    const exists = await this.prisma.blockedLinkDomain.findUnique({
      where: { domain },
      select: { id: true },
    });
    if (exists) throw new ConflictException('DOMAIN_ALREADY_BLOCKED');
    try {
      // The block and its audit entry are saved together or not at all.
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.blockedLinkDomain.create({
          data: {
            domain,
            reason: reason?.trim() || null,
            createdByAdminId: adminId,
          },
        });
        await this.logAdminAction.execute(
          adminId,
          AdminAction.LINK_DOMAIN_BLOCKED,
          'link_domain',
          row.id,
          reason?.trim() ? `${domain}: ${reason.trim()}` : domain,
          undefined,
          tx,
        );
        return row;
      });
    } catch (err) {
      // Another staff member blocked it a moment before.
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('DOMAIN_ALREADY_BLOCKED');
      }
      throw err;
    }
  }

  async unblock(adminId: string, id: string) {
    const row = await this.prisma.blockedLinkDomain.findUnique({
      where: { id },
      select: { id: true, domain: true },
    });
    if (!row) throw new NotFoundException('Blocked domain not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.blockedLinkDomain.delete({ where: { id } });
      await this.logAdminAction.execute(
        adminId,
        AdminAction.LINK_DOMAIN_UNBLOCKED,
        'link_domain',
        id,
        row.domain,
        undefined,
        tx,
      );
    });
    return { id, domain: row.domain };
  }
}
