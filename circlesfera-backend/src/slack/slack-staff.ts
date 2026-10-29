import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  type StaffPermission,
  staffHoldsPermission,
} from '../auth/guards/admin.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The member of staff behind a Slack account: the active staff identity with
 * the email of that Slack account, when it holds the permission an action
 * needs.
 * Moderation from Slack acts as that identity, so it follows the same rules,
 * notices, audit log and appeals as the Admin Panel. Without a match nothing
 * is done.
 */
@Injectable()
export class SlackStaff {
  private readonly logger = new Logger(SlackStaff.name);
  private readonly botToken: string | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.botToken = config.get<string>('SLACK_BOT_TOKEN');
  }

  /** The email of a Slack account, read with the bot (users:read.email). */
  private async emailOf(slackUserId: string): Promise<string | null> {
    if (!this.botToken || !/^[A-Z0-9]{2,32}$/.test(slackUserId)) return null;
    try {
      const { data } = await axios.get('https://slack.com/api/users.info', {
        params: { user: slackUserId },
        headers: { Authorization: `Bearer ${this.botToken}` },
        timeout: 5_000,
      });
      const email: unknown = data?.ok ? data.user?.profile?.email : null;
      return typeof email === 'string' && email.includes('@') ? email : null;
    } catch (error) {
      this.logger.warn('Could not read the Slack account of an action', error);
      return null;
    }
  }

  /** The staff identity that may act on reports, or nothing. */
  moderatorFor(slackUserId: unknown): Promise<string | null> {
    return this.staffFor(slackUserId, 'reports');
  }

  /** The staff identity that holds the permission, or nothing. */
  async staffFor(
    slackUserId: unknown,
    permission: StaffPermission,
  ): Promise<string | null> {
    if (typeof slackUserId !== 'string') return null;
    const email = await this.emailOf(slackUserId);
    if (!email) return null;
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (admin?.status !== 'ACTIVE') return null;
    const roles = admin.roles.map((r) => r.role.name);
    const permissions = admin.roles.flatMap((r) =>
      r.role.permissions.map((p) => p.permission.key),
    );
    return staffHoldsPermission({ roles, permissions }, permission)
      ? admin.id
      : null;
  }
}
