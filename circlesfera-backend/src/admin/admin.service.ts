import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { AdminAction } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @InjectQueue('analytics-processing') private readonly analyticsQueue: Queue,
  ) {}

  /** Log every admin action for accountability. */
  async logAction(
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

  // ─── Statistics ───────────────────────────────────────────────────

  /** Basic stats for backwards compatibility. */
  async getStats() {
    const [userCount, postCount, storyCount, activeReports] = await Promise.all(
      [
        this.prisma.user.count(),
        this.prisma.post.count(),
        this.prisma.story.count(),
        this.prisma.report.count({ where: { status: 'PENDING' } }),
      ],
    );

    return {
      users: userCount,
      posts: postCount,
      stories: storyCount,
      pendingReports: activeReports,
    };
  }

  // ─── System Health ────────────────────────────────────────────────

  async getSystemHealth() {
    // 1. Database Status
    let dbStatus = 'OFFLINE';
    let dbLatency = 0;
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - start;
      dbStatus = 'ONLINE';
    } catch (e) {
      console.error('Database health check failed:', e);
    }

    // 2. Queue Status
    const [aiCounts, analyticsCounts] = await Promise.all([
      this.aiQueue.getJobCounts('wait', 'active', 'failed', 'completed'),
      this.analyticsQueue.getJobCounts('wait', 'active', 'failed', 'completed'),
    ]);

    // 3. Webhook Health
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failedWebhooks, processedWebhooks] = await Promise.all([
      this.prisma.webhookEvent.count({
        where: { createdAt: { gte: oneDayAgo }, status: 'FAILED' },
      }),
      this.prisma.webhookEvent.count({
        where: { createdAt: { gte: oneDayAgo }, status: 'PROCESSED' },
      }),
    ]);

    return {
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs: dbLatency,
      },
      queues: {
        ai: aiCounts,
        analytics: analyticsCounts,
      },
      webhooks: {
        failed24h: failedWebhooks,
        processed24h: processedWebhooks,
      },
    };
  }

  // ─── System Settings ─────────────────────────────────────────────

  async getSystemSettings() {
    return this.prisma.systemSetting.findMany();
  }

  async updateSystemSettings(adminId: string, updates: any[]) {
    if (!updates || !Array.isArray(updates)) return { count: 0 };

    let count = 0;
    for (const setting of updates) {
      await this.prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: { value: setting.value, updatedBy: adminId },
        create: {
          key: setting.key,
          value: setting.value,
          description: setting.description || '',
          updatedBy: adminId,
        },
      });
      count++;
    }

    await this.logAction(
      adminId,
      AdminAction.UPDATE_SETTINGS,
      'system',
      'bulk',
      `Updated ${count} settings`,
    );
    return { count };
  }

  // ─── Firewall Rules ──────────────────────────────────────────────

  async getFirewallRules(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) {
      where.keyword = { contains: search, mode: 'insensitive' };
    }
    const [data, total] = await Promise.all([
      this.prisma.moderationRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.moderationRule.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createFirewallRule(adminId: string, body: any) {
    const rule = await this.prisma.moderationRule.create({
      data: {
        keyword: body.keyword,
        action: body.action || 'FLAG',
        isActive: body.isActive ?? true,
        createdBy: adminId,
      },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_SETTINGS,
      'moderation_rule',
      rule.id,
      `Created rule for ${body.keyword}`,
    );
    return rule;
  }

  async updateFirewallRule(adminId: string, ruleId: string, body: any) {
    const rule = await this.prisma.moderationRule.update({
      where: { id: ruleId },
      data: {
        action: body.action,
        isActive: body.isActive,
      },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_SETTINGS,
      'moderation_rule',
      ruleId,
      'Updated moderation rule',
    );
    return rule;
  }

  async deleteFirewallRule(adminId: string, ruleId: string) {
    const rule = await this.prisma.moderationRule.delete({
      where: { id: ruleId },
    });
    await this.logAction(
      adminId,
      AdminAction.UPDATE_SETTINGS,
      'moderation_rule',
      ruleId,
      'Deleted moderation rule',
    );
    return rule;
  }
}
