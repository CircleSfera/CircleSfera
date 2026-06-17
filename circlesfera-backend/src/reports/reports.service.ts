import { Inject, Injectable } from '@nestjs/common';
import type { Report, ReportStatus } from '@prisma/client';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import {
  type CreateReportDto,
  ReportTargetType,
} from './dto/create-report.dto.js';

/** Service for content/user reports: creation, listing, and status updates. */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AIService) private readonly aiService: AIService,
    @Inject(SlackService) private readonly slackService: SlackService,
  ) {}

  /**
   * File a new report against a user or content.
   * @param reporterId - The reporting user's ID
   * @param dto - Report details (targetType, targetId, reason, details)
   */
  async create(reporterId: string, dto: CreateReportDto): Promise<Report> {
    let aiAssessment = null;

    if (dto.targetType === ReportTargetType.POST) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.targetId },
      });
      if (post?.caption) {
        try {
          const mod = await this.aiService.moderateContent(post.caption);
          if (mod.flagged) {
            const flags = Object.entries(mod.categories)
              .filter(([, isFlagged]) => isFlagged)
              .map(([key]) => key)
              .join(', ');
            aiAssessment = `[AI Automated Flag]: This post was flagged for: ${flags}`;
          }
        } catch {
          // Ignore AI errors so they don't block the report creation
        }
      }
    }

    const finalDetails = aiAssessment
      ? dto.details
        ? `${dto.details}\n\n${aiAssessment}`
        : aiAssessment
      : dto.details;

    const report = (await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: finalDetails,
      },
    })) as Report;

    // Send Slack alert in the background
    this.slackService
      .sendModerationAlert({
        reportId: report.id,
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: finalDetails || undefined,
      })
      .catch((e) => console.error('Failed to send slack moderation alert', e));

    return report;
  }

  /** List all reports with reporter profiles (admin only). */
  async findAll(): Promise<Report[]> {
    const reports = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          include: { profile: true },
        },
      },
    });
    return reports as unknown as Report[];
  }

  /**
   * Update a report's status (e.g. PENDING → RESOLVED).
   * @param id - The report ID
   * @param status - The new status value (ReportStatus enum)
   */
  async update(id: string, status: ReportStatus): Promise<Report> {
    return (await this.prisma.report.update({
      where: { id },
      data: { status },
    })) as Report;
  }
}
