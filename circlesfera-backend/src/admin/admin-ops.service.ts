import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminAction,
  type Prisma,
  type TicketCategory,
  type TicketStatus,
} from '@prisma/client';
import type { Cache } from 'cache-manager';
import type Stripe from 'stripe';
import { AIService } from '../ai/ai.service.js';
import { withPrimaryProfile } from '../common/utils/user-profile-shape.util.js';
import { EmailService } from '../email/email.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolvedAtOnStatusChange } from './utils/resolved-at.util.js';

// Admin operations that are orthogonal to core user/content moderation:
// AI vector firewall signatures, per-user experiment overrides,
// Support tickets, feature flags, and webhook event ops.
@Injectable()
export class AdminOpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AIService) private readonly aiService: AIService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async logAction(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    details?: string,
  ) {
    await this.prisma.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, details },
    });
  }

  async getFirewallSignatures(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [signatures, total] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT id, category, "textPreview", "createdAt"
        FROM moderation_signatures
        ORDER BY "createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.moderationSignature.count(),
    ]);

    return {
      data: signatures,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async addFirewallSignature(adminId: string, text: string, category: string) {
    if (!text || text.trim().length === 0) {
      throw new BadRequestException('Text cannot be empty');
    }

    const embedding = await this.aiService.generateEmbedding(text);

    await this.prisma.$executeRaw`
      INSERT INTO moderation_signatures (id, category, vector, "textPreview")
      VALUES (gen_random_uuid(), ${category}, ${JSON.stringify(embedding)}::vector, ${text.substring(0, 500)})
    `;

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'firewall',
      'new_rule',
      `Added firewall rule for category: ${category}`,
    );

    return { success: true };
  }

  async deleteFirewallSignature(adminId: string, id: string) {
    await this.prisma.moderationSignature.delete({
      where: { id },
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'firewall',
      id,
      `Deleted firewall rule`,
    );

    return { success: true };
  }

  async getUserExperiments(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.UserExperimentWhereInput = search
      ? {
          OR: [
            { experimentKey: { contains: search, mode: 'insensitive' } },
            {
              user: {
                profiles: {
                  some: {
                    username: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            },
          ],
        }
      : {};

    const [experiments, total] = await Promise.all([
      this.prisma.userExperiment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              profiles: {
                select: { avatar: true, fullName: true, username: true },
              },
            },
          },
        },
      }),
      this.prisma.userExperiment.count({ where }),
    ]);

    return {
      data: experiments.map((experiment) => ({
        ...experiment,
        user: experiment.user ? withPrimaryProfile(experiment.user) : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async assignUserExperiment(
    adminId: string,
    userId: string,
    experimentKey: string,
    variant: string,
  ) {
    const experiment = await this.prisma.userExperiment.upsert({
      where: {
        userId_experimentKey: { userId, experimentKey },
      },
      update: { variant },
      create: { userId, experimentKey, variant },
      include: {
        user: { select: { profiles: { select: { username: true } } } },
      },
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'user_experiment',
      experiment.id,
      `Assigned ${experiment.user?.profiles[0]?.username || userId} to ${experimentKey} (${variant})`,
    );

    return experiment;
  }

  async removeUserExperiment(adminId: string, id: string) {
    const experiment = await this.prisma.userExperiment.delete({
      where: { id },
      include: {
        user: { select: { profiles: { select: { username: true } } } },
      },
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'user_experiment',
      id,
      `Removed ${experiment.user?.profiles[0]?.username || experiment.userId} from ${experiment.experimentKey}`,
    );

    return { success: true };
  }

  // Support tickets

  async getSupportTickets(
    page = 1,
    limit = 20,
    status?: string,
    category?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.SupportTicketWhereInput = {};
    if (
      status &&
      ['OPEN', 'RESOLVED', 'CLOSED', 'ESCALATED'].includes(status)
    ) {
      where.status = status as TicketStatus;
    }
    if (
      category &&
      ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'].includes(category)
    ) {
      where.category = category as TicketCategory;
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        // Open tickets: the one waiting longest first. Any other list: newest first.
        orderBy: { createdAt: where.status === 'OPEN' ? 'asc' : 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profiles: {
                select: { username: true, avatar: true, fullName: true },
              },
            },
          },
          // Where the ticket stands with moderation, when it was handed over
          escalatedReport: { select: { id: true, status: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      data: tickets.map((ticket) => ({
        ...ticket,
        user: ticket.user ? withPrimaryProfile(ticket.user) : null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async updateSupportTicket(
    adminId: string,
    id: string,
    data: { status?: TicketStatus; reply?: string },
  ) {
    const existing = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Support ticket not found');
    }

    // A ticket handed to moderation is theirs until they decide its report;
    // support cannot answer or close it meanwhile.
    if (existing.status === 'ESCALATED' && existing.escalatedReportId) {
      const report = await this.prisma.report.findUnique({
        where: { id: existing.escalatedReportId },
        select: { status: true },
      });
      if (report && ['PENDING', 'REVIEWING'].includes(report.status)) {
        throw new ConflictException(
          'This ticket is with moderation until its report is decided',
        );
      }
    }

    const updateData: Prisma.SupportTicketUpdateInput = {};
    if (data.reply !== undefined) updateData.reply = data.reply;

    const effectiveStatus =
      data.status ??
      (data.reply?.trim() && existing.status === 'OPEN'
        ? 'RESOLVED'
        : undefined);

    if (effectiveStatus) {
      updateData.status = effectiveStatus;
      const resolvedAt = resolvedAtOnStatusChange(
        effectiveStatus,
        existing.resolvedAt,
        ['RESOLVED', 'CLOSED'],
        'OPEN',
      );
      if (resolvedAt !== undefined) {
        updateData.resolvedAt = resolvedAt;
      }
    }

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });

    if (data.reply?.trim()) {
      await this.emailService.sendSupportReplyEmail(
        ticket.email,
        ticket.subject,
        data.reply.trim(),
      );
    }

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'support_ticket',
      id,
      `Updated ticket ${id}${effectiveStatus ? ` → ${effectiveStatus}` : data.status ? ` → ${data.status}` : ''}${data.reply ? ' (replied)' : ''}`,
    );

    return ticket;
  }

  // Hands a ticket to moderation: a report in the trust queues, linked to the
  // ticket, and the ticket marked as being there.
  async escalateSupportTicket(adminId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.status !== 'OPEN') {
      throw new ConflictException('Only an open ticket can be handed over');
    }
    // A report is filed by a Profile: the first one of whoever wrote in.
    const reporter = ticket.userId
      ? await this.prisma.profile.findFirst({
          where: { userId: ticket.userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      : null;
    if (!reporter) {
      throw new ConflictException(
        'The account that wrote this ticket no longer exists',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          reporterId: reporter.id,
          reason: 'OTHER',
          targetType: 'SYSTEM',
          targetId: ticket.id,
          details: `Support ticket: ${ticket.subject}\n\n${ticket.message}`,
        },
        select: { id: true, status: true },
      });
      return tx.supportTicket.update({
        where: { id },
        data: { status: 'ESCALATED', escalatedReportId: report.id },
        include: { escalatedReport: { select: { id: true, status: true } } },
      });
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'support_ticket',
      id,
      `Handed ticket ${id} to moderation (report ${updated.escalatedReportId})`,
    );

    return updated;
  }

  // What support needs to know about who wrote a ticket: plan, payout
  // account and standing of each Profile. It reads; it changes nothing.
  async getSupportTicketAccount(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (!ticket.userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
      select: {
        id: true,
        isActive: true,
        createdAt: true,
        identityVerifiedAt: true,
        stripeConnectAccountId: true,
        monetization: { select: { transfersEnabled: true } },
        profiles: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            username: true,
            accountType: true,
            verificationLevel: true,
            isAccountBanned: true,
            suspendedUntil: true,
          },
        },
        platformSubscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: { select: { name: true } },
          },
        },
      },
    });
    if (!user) return null;

    const [subscription] = user.platformSubscriptions;
    const now = new Date();
    return {
      userId: user.id,
      isActive: user.isActive,
      memberSince: user.createdAt,
      identityVerified: !!user.identityVerifiedAt,
      plan: subscription
        ? {
            name: subscription.plan.name,
            renewsAt: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      payouts: {
        connected: !!user.stripeConnectAccountId,
        enabled: !!user.monetization?.transfersEnabled,
      },
      profiles: user.profiles.map((profile) => ({
        id: profile.id,
        username: profile.username,
        accountType: profile.accountType,
        verificationLevel: profile.verificationLevel,
        banned: profile.isAccountBanned,
        suspended: !!profile.suspendedUntil && profile.suspendedUntil > now,
      })),
    };
  }

  // Feature flags

  async listFeatureFlags() {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async upsertFeatureFlag(
    adminId: string,
    data: {
      key: string;
      name?: string;
      description?: string;
      isEnabled?: boolean;
      percentage?: number;
    },
  ) {
    if (!data.key?.trim()) {
      throw new BadRequestException('key is required');
    }
    const key = data.key.trim();
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(key)) {
      throw new BadRequestException(
        'key must be snake_case (lowercase letters, digits, underscores), 2–80 characters, starting with a letter',
      );
    }
    if (
      data.percentage !== undefined &&
      (data.percentage < 0 || data.percentage > 100)
    ) {
      throw new BadRequestException('percentage must be 0–100');
    }

    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.isEnabled !== undefined ? { isEnabled: data.isEnabled } : {}),
        ...(data.percentage !== undefined
          ? { percentage: data.percentage }
          : {}),
      },
      create: {
        key,
        name: data.name || key,
        description: data.description,
        isEnabled: data.isEnabled ?? false,
        percentage: data.percentage ?? 0,
      },
    });

    await this.cacheManager.del(`feature_flag:${key}`);
    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'feature_flag',
      flag.id,
      `Upserted flag ${key} enabled=${flag.isEnabled} pct=${flag.percentage}`,
    );

    return flag;
  }

  async deleteFeatureFlag(adminId: string, key: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found`);
    }

    await this.prisma.featureFlag.delete({ where: { key } });
    await this.cacheManager.del(`feature_flag:${key}`);
    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'feature_flag',
      flag.id,
      `Deleted flag ${key}`,
    );

    return { success: true };
  }

  // Webhook events

  async getWebhookEvents(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.WebhookEventWhereInput = {};
    if (status && ['PENDING', 'PROCESSED', 'FAILED'].includes(status)) {
      where.status = status;
    }

    const [events, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          provider: true,
          externalId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          processedAt: true,
        },
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getWebhookEvent(id: string) {
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id },
    });
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }
    return event;
  }

  // Reprocess a FAILED or PENDING Stripe webhook from stored payload.
  // PROCESSED events are rejected to avoid double-application.
  async replayWebhookEvent(adminId: string, id: string) {
    const stored = await this.prisma.webhookEvent.findUnique({
      where: { id },
    });
    if (!stored) {
      throw new NotFoundException('Webhook event not found');
    }
    if (stored.status === 'PROCESSED') {
      throw new BadRequestException('Event already processed');
    }
    if (stored.provider !== 'stripe') {
      throw new BadRequestException(
        `Replay not supported for provider: ${stored.provider}`,
      );
    }

    await this.prisma.webhookEvent.update({
      where: { id },
      data: { status: 'PENDING' },
    });

    const payload = stored.payload as unknown as Stripe.Event;
    if (!payload?.id) {
      throw new BadRequestException('Stored payload missing Stripe event id');
    }

    await this.paymentsService.processWebhookEvent(payload);

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'webhook_event',
      id,
      `Replayed ${stored.externalId}`,
    );

    return this.prisma.webhookEvent.findUnique({ where: { id } });
  }
}
