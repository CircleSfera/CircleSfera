import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ModerationStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AIService } from '../ai.service.js';

@Processor('ai-processing')
export class AIProcessor extends WorkerHost {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    @Inject(AIService) private readonly aiService: AIService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'generate-embedding':
        return this.handleGenerateEmbedding(
          job as Job<{ postId: string; text: string }, any, string>,
        );
      case 'moderate-content':
        return this.handleModerateContent(
          job as Job<
            {
              targetId: string;
              text: string;
              targetType: 'POST' | 'STORY' | 'COMMENT';
            },
            any,
            string
          >,
        );
      case 'generate-alt-text':
        return this.handleGenerateAltText(
          job as Job<{ postId: string }, any, string>,
        );
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleGenerateAltText(
    job: Job<{ postId: string }, any, string>,
  ) {
    const { postId } = job.data;
    this.logger.log(`Processing alt-text for post: ${postId}`);

    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: { media: true },
      });

      if (!post || post.media.length === 0) return;

      for (const media of post.media) {
        if (media.type === 'image' && !media.altText) {
          const altText = await this.aiService.generateAltText(
            media.standardUrl || media.url,
          );
          await this.prisma.postMedia.update({
            where: { id: media.id },
            data: { altText },
          });
        }
      }

      this.logger.log(`Successfully generated alt-text for post: ${postId}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to process alt-text for post ${postId}`, error);
    }
  }

  private async handleGenerateEmbedding(
    job: Job<{ postId: string; text: string }, any, string>,
  ) {
    const { postId, text } = job.data;
    this.logger.log(`Processing embedding for post: ${postId}`);

    try {
      const embedding = await this.aiService.generateEmbedding(text);

      await this.prisma.$executeRaw`
        INSERT INTO post_embeddings ("postId", vector)
        VALUES (${postId}, ${JSON.stringify(embedding)}::vector)
        ON CONFLICT ("postId") 
        DO UPDATE SET vector = EXCLUDED.vector
      `;

      this.logger.log(`Successfully updated embedding for post: ${postId}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process embedding for post ${postId}: ${errorMessage}`,
      );
      throw error;
    }
  }

  private async handleModerateContent(
    job: Job<
      {
        targetId: string;
        text: string;
        targetType: 'POST' | 'STORY' | 'COMMENT';
        mediaUrls?: string[];
      },
      any,
      string
    >,
  ) {
    let { targetId, text, targetType, mediaUrls } = job.data;

    this.logger.log(`Processing moderation for ${targetType}: ${targetId}`);

    // If mediaUrls not provided, try to fetch them (safety fallback)
    if (!mediaUrls || mediaUrls.length === 0) {
      if (targetType === 'POST') {
        const post = await this.prisma.post.findUnique({
          where: { id: targetId },
          include: { media: true },
        });
        mediaUrls = post?.media
          .map((m) => m.thumbnailUrl || m.url)
          .filter(Boolean) as string[];
      } else if (targetType === 'STORY') {
        const story = await this.prisma.story.findUnique({
          where: { id: targetId },
        });
        if (story)
          mediaUrls = [story.thumbnailUrl || story.url].filter(
            Boolean,
          ) as string[];
      } else if (targetType === 'COMMENT') {
        const comment = await this.prisma.comment.findUnique({
          where: { id: targetId },
        });
        if (comment?.url) mediaUrls = [comment.url];
      }
    }

    try {
      // Vector Firewall: Pre-check using existing ModerationSignatures
      if (text && text.trim().length > 0) {
        this.logger.log('Checking Vector Firewall...');
        const embedding = await this.aiService.generateEmbedding(text);

        // Find if this text is similar to any known bad signature
        // Using cosine distance operator `<=>`. A distance < 0.1 means similarity > 0.9.
        const matches = await this.prisma.$queryRaw<any[]>`
          SELECT id, category, 1 - (vector <=> ${JSON.stringify(embedding)}::vector) as similarity
          FROM moderation_signatures
          WHERE 1 - (vector <=> ${JSON.stringify(embedding)}::vector) > 0.90
          LIMIT 1;
        `;

        if (matches && matches.length > 0) {
          const match = matches[0];
          this.logger.warn(
            `Vector Firewall triggered! Similarity: ${match.similarity} to category: ${match.category}`,
          );

          const aiAssessment = `[AI Vector Firewall]: Auto-hidden due to high similarity (${Math.round(match.similarity * 100)}%) with known abusive content (Category: ${match.category}).`;

          const updateData = {
            moderationStatus: ModerationStatus.HIDDEN,
            moderationNote: aiAssessment,
          };

          let authorId: string | null = null;
          if (targetType === 'POST') {
            const res = await this.prisma.post.update({
              where: { id: targetId },
              data: updateData,
              select: { userId: true },
            });
            authorId = res.userId;
          } else if (targetType === 'STORY') {
            const res = await this.prisma.story.update({
              where: { id: targetId },
              data: updateData,
              select: { userId: true },
            });
            authorId = res.userId;
          } else if (targetType === 'COMMENT') {
            const res = await this.prisma.comment.update({
              where: { id: targetId },
              data: updateData,
              select: { userId: true },
            });
            authorId = res.userId;
          }

          const adminUser = await this.prisma.user.findFirst({
            where: { role: 'ADMIN' },
            select: { id: true },
          });
          if (adminUser) {
            await this.prisma.report.create({
              data: {
                reporterId: adminUser.id,
                targetType,
                targetId,
                reason: 'OTHER',
                details: aiAssessment,
              },
            });

            // Check author strikes
            if (authorId) {
              await this.applyStrikeAndCheckEscalation(authorId, adminUser.id);
            }
          }

          return; // EXIT EARLY! DO NOT CALL OPENAI
        }
      }

      // If Vector Firewall passes, proceed to OpenAI
      const mod = await this.aiService.moderateContent(text || '', mediaUrls);
      if (mod.flagged) {
        const flags = Object.entries(mod.categories)
          .filter(([, isFlagged]) => isFlagged)
          .map(([key]) => key);

        // Save this new bad signature to the firewall for future blocking
        if (text && text.trim().length > 0) {
          try {
            const badEmbedding = await this.aiService.generateEmbedding(text);
            await this.prisma.$executeRaw`
              INSERT INTO moderation_signatures (id, category, vector, "textPreview")
              VALUES (gen_random_uuid(), ${flags[0] || 'unknown'}, ${JSON.stringify(badEmbedding)}::vector, ${text.substring(0, 500)})
            `;
            this.logger.log(
              `Added new moderation signature to Vector Firewall for category: ${flags[0]}`,
            );
          } catch (err) {
            this.logger.error('Failed to save moderation signature', err);
          }
        }

        const aiAssessment = `[AI Automated Flag]: This content was flagged for: ${flags.join(', ')}`;

        // Determine if we should hide it immediately
        // We hide if it's sexual, hate, harassment, or violence with high score
        const shouldHide =
          mod.categories.sexual ||
          mod.categories['sexual/minors'] ||
          mod.categories.hate ||
          mod.categories.harassment ||
          mod.categories.violence ||
          mod.categories['self-harm'];

        const status: ModerationStatus = shouldHide
          ? ModerationStatus.HIDDEN
          : ModerationStatus.FLAGGED;

        // Update the target content status
        const updateData = {
          moderationStatus: status,
          moderationNote: aiAssessment,
        };

        let authorId: string | null = null;
        if (targetType === 'POST') {
          const res = await this.prisma.post.update({
            where: { id: targetId },
            data: updateData,
            select: { userId: true },
          });
          authorId = res.userId;
        } else if (targetType === 'STORY') {
          const res = await this.prisma.story.update({
            where: { id: targetId },
            data: updateData,
            select: { userId: true },
          });
          authorId = res.userId;
        } else if (targetType === 'COMMENT') {
          const res = await this.prisma.comment.update({
            where: { id: targetId },
            data: updateData,
            select: { userId: true },
          });
          authorId = res.userId;
        }

        // Find system admin to attribute the report to
        const adminUser = await this.prisma.user.findFirst({
          where: { role: 'ADMIN' },
          select: { id: true },
        });

        if (adminUser) {
          await this.prisma.report.create({
            data: {
              reporterId: adminUser.id,
              targetType,
              targetId,
              reason: 'OTHER',
              details: aiAssessment,
            },
          });
          this.logger.warn(
            `AI automatically set ${targetType} ${targetId} to ${status} for ${flags.join(', ')}`,
          );

          if (shouldHide && authorId) {
            await this.applyStrikeAndCheckEscalation(authorId, adminUser.id);
          }
        } else {
          this.logger.error(
            `Cannot create
          AI;
          report;
          for ${targetId}
          : No ADMIN user found.`,
          );
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to process moderation for ${targetType} ${targetId}: ${errorMessage}`,
      );
      throw error;
    }
  }

  private async applyStrikeAndCheckEscalation(userId: string, adminId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { strikeCount: { increment: 1 } },
      select: { strikeCount: true },
    });

    this.logger.log(`User ${userId} now has ${user.strikeCount} strikes.`);

    if (user.strikeCount >= 3) {
      this.logger.warn(
        `User ${userId} reached 3 strikes. Escalating to Admin...`,
      );
      await this.prisma.report.create({
        data: {
          reporterId: adminId,
          targetType: 'USER',
          targetId: userId,
          reason: 'OTHER',
          details: `[URGENT] El usuario ha acumulado ${user.strikeCount} strikes por violaciones de contenido ocultadas automáticamente. Requiere revisión manual para posible suspensión de cuenta.`,
        },
      });
    }
  }
}
