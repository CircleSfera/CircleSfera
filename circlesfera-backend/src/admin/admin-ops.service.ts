import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, type Prisma, type TicketStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import { EmailService } from '../email/email.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Admin operations that are orthogonal to core user/content moderation:
 * AI vector firewall signatures, per-user experiment overrides,
 * support tickets, feature flags, and webhook event ops.
 */
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
                profile: {
                  username: { contains: search, mode: 'insensitive' },
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
              profile: {
                select: { avatar: true, fullName: true, username: true },
              },
            },
          },
        },
      }),
      this.prisma.userExperiment.count({ where }),
    ]);

    return {
      data: experiments,
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
        user: { select: { profile: { select: { username: true } } } },
      },
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'user_experiment',
      experiment.id,
      `Assigned ${experiment.user?.profile?.username || userId} to ${experimentKey} (${variant})`,
    );

    return experiment;
  }

  async removeUserExperiment(adminId: string, id: string) {
    const experiment = await this.prisma.userExperiment.delete({
      where: { id },
      include: {
        user: { select: { profile: { select: { username: true } } } },
      },
    });

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'user_experiment',
      id,
      `Removed ${experiment.user?.profile?.username || experiment.userId} from ${experiment.experimentKey}`,
    );

    return { success: true };
  }

  // ─── Support tickets ──────────────────────────────────────────────

  async getSupportTickets(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.SupportTicketWhereInput = {};
    if (status && ['OPEN', 'RESOLVED', 'CLOSED'].includes(status)) {
      where.status = status as TicketStatus;
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { username: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      data: tickets,
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

    const updateData: Prisma.SupportTicketUpdateInput = {};
    if (data.status) updateData.status = data.status;
    if (data.reply !== undefined) updateData.reply = data.reply;

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
      if (!data.status && ticket.status === 'OPEN') {
        await this.prisma.supportTicket.update({
          where: { id },
          data: { status: 'RESOLVED' },
        });
        ticket.status = 'RESOLVED';
      }
    }

    await this.logAction(
      adminId,
      AdminAction.MANUAL_OVERRIDE,
      'support_ticket',
      id,
      `Updated ticket ${id}${data.status ? ` → ${data.status}` : ''}${data.reply ? ' (replied)' : ''}`,
    );

    return ticket;
  }

  // ─── Feature flags ────────────────────────────────────────────────

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

  // ─── Webhook events ───────────────────────────────────────────────

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

  /**
   * Reprocess a FAILED or PENDING Stripe webhook from stored payload.
   * PROCESSED events are rejected to avoid double-application.
   */
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

    const payload = stored.payload as { id?: string };
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
