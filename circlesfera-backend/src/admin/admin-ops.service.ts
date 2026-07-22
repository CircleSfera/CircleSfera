import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AdminAction, type Prisma } from '@prisma/client';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Admin operations that are orthogonal to core user/content moderation:
 * AI vector firewall signatures and per-user experiment overrides.
 */
@Injectable()
export class AdminOpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AIService) private readonly aiService: AIService,
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
}
