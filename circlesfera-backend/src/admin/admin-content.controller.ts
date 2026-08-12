import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type PromotionStatus, type ReportStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { DeleteCommentUseCase } from './use-cases/content/commands/delete-comment.use-case.js';
import { DeletePostUseCase } from './use-cases/content/commands/delete-post.use-case.js';
import { DeleteStoryUseCase } from './use-cases/content/commands/delete-story.use-case.js';
import { EndLiveStreamUseCase } from './use-cases/content/commands/end-live-stream.use-case.js';
import { ModerateContentUseCase } from './use-cases/content/commands/moderate-content.use-case.js';
import { ReviewPromotionUseCase } from './use-cases/content/commands/review-promotion.use-case.js';
import { ReviewReportUseCase } from './use-cases/content/commands/review-report.use-case.js';
import { GetContentQuery } from './use-cases/content/queries/get-content.query.js';
import { GetLiveStreamsQuery } from './use-cases/content/queries/get-live-streams.query.js';
import { GetModerationQueueQuery } from './use-cases/content/queries/get-moderation-queue.query.js';
import { GetPostsQuery } from './use-cases/content/queries/get-posts.query.js';
import { GetPromotionsQuery } from './use-cases/content/queries/get-promotions.query.js';
import { GetReportsQuery } from './use-cases/content/queries/get-reports.query.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminContentController {
  constructor(
    @Inject(GetPostsQuery) private readonly getPostsQuery: GetPostsQuery,
    @Inject(DeletePostUseCase)
    private readonly deletePostUseCase: DeletePostUseCase,
    @Inject(GetReportsQuery) private readonly getReportsQuery: GetReportsQuery,
    @Inject(ReviewReportUseCase)
    private readonly reviewReportUseCase: ReviewReportUseCase,
    @Inject(GetContentQuery) private readonly getContentQuery: GetContentQuery,
    @Inject(DeleteCommentUseCase)
    private readonly deleteCommentUseCase: DeleteCommentUseCase,
    @Inject(DeleteStoryUseCase)
    private readonly deleteStoryUseCase: DeleteStoryUseCase,
    @Inject(GetPromotionsQuery)
    private readonly getPromotionsQuery: GetPromotionsQuery,
    @Inject(ReviewPromotionUseCase)
    private readonly reviewPromotionUseCase: ReviewPromotionUseCase,
    @Inject(GetModerationQueueQuery)
    private readonly getModerationQueueQuery: GetModerationQueueQuery,
    @Inject(ModerateContentUseCase)
    private readonly moderateContentUseCase: ModerateContentUseCase,
    @Inject(GetLiveStreamsQuery)
    private readonly getLiveStreamsQuery: GetLiveStreamsQuery,
    @Inject(EndLiveStreamUseCase)
    private readonly endLiveStreamUseCase: EndLiveStreamUseCase,
  ) {}

  @RequireStaffPermissions('content')
  @Get('posts/export')
  async exportPostsCSV(@Res() res: Response) {
    const csv = await this.getContentQuery.exportPostsCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=circlesfera-posts.csv',
    );
    res.send(csv);
  }

  @RequireStaffPermissions('content')
  @Get('posts')
  async getPosts(@Query() query: AdminQueryDto) {
    return this.getPostsQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.type,
    );
  }

  @RequireStaffPermissions('content')
  @Delete('posts/:id')
  async deletePost(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.deletePostUseCase.execute(req.user.userId, id);
  }

  @RequireStaffPermissions('reports')
  @Get('reports')
  async getReports(@Query() query: AdminQueryDto) {
    return this.getReportsQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.status,
    );
  }

  @Patch('reports/:id')
  @RequireStaffPermissions('reports')
  async updateReport(
    @Param('id') id: string,
    @Body('status') status: ReportStatus,
    @Body('internalNotes') internalNotes: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.reviewReportUseCase.updateStatus(
      req.user.userId,
      id,
      status,
      internalNotes,
    );
  }

  @Post('reports/:id/claim')
  @RequireStaffPermissions('reports')
  async claimReport(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.reviewReportUseCase.claim(req.user.userId, id);
  }

  @Post('reports/:id/resolve-penalty')
  @RequireStaffPermissions('reports')
  async resolveReportWithPenalty(
    @Param('id') id: string,
    @Body('action') action: 'IGNORE' | 'STRIKE' | 'BAN',
    @Req() req: AuthRequest,
  ) {
    return this.reviewReportUseCase.resolveWithPenalty(
      req.user.userId,
      id,
      action,
    );
  }

  @Post('reports/bulk')
  @RequireStaffPermissions('reports')
  async bulkUpdateReports(
    @Body() body: { ids: string[]; status: ReportStatus },
    @Req() req: AuthRequest,
  ) {
    return this.reviewReportUseCase.bulkUpdate(
      req.user.userId,
      body.ids ?? [],
      body.status,
    );
  }

  @RequireStaffPermissions('content')
  @Get('hashtags')
  async getHashtags(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getHashtags(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  @RequireStaffPermissions('content')
  @Get('comments')
  async getComments(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getComments(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
    );
  }

  @RequireStaffPermissions('content')
  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.deleteCommentUseCase.execute(req.user.userId, id);
  }

  @RequireStaffPermissions('content')
  @Get('stories')
  async getStories(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getStories(query.page ?? 1, query.limit ?? 10, {
      moderationStatus: query.moderationStatus,
      expired: query.expired,
    });
  }

  @RequireStaffPermissions('content')
  @Delete('stories/:id')
  async deleteStory(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.deleteStoryUseCase.execute(req.user.userId, id);
  }

  @RequireStaffPermissions('content')
  @Get('promotions')
  async getPromotions(@Query() query: AdminQueryDto) {
    return this.getPromotionsQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.status as PromotionStatus,
      query.search,
    );
  }

  @RequireStaffPermissions('content')
  @Patch('promotions/:id')
  async updatePromotionStatus(
    @Param('id') id: string,
    @Body('status') status: PromotionStatus,
    @Body('note') note: string,
    @Req() req: AuthRequest,
  ) {
    return this.reviewPromotionUseCase.execute(
      req.user.userId,
      id,
      status,
      note,
    );
  }

  @RequireStaffPermissions('moderation')
  @Get('moderation/queue')
  async getModerationQueue(@Query() query: AdminQueryDto) {
    return this.getModerationQueueQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.type,
      query.search,
    );
  }

  @RequireStaffPermissions('moderation')
  @Patch('moderation/:type/:id')
  async updateModerationStatus(
    @Param('type') type: 'POST' | 'STORY' | 'COMMENT',
    @Param('id') id: string,
    @Body('status') status: 'VISIBLE' | 'HIDDEN' | 'REMOVED',
    @Body('note') note: string,
    @Req() req: AuthRequest,
  ) {
    return this.moderateContentUseCase.execute(
      req.user.userId,
      type,
      id,
      status,
      note,
    );
  }

  @Get('trust/queue')
  @RequireStaffPermissions('reports')
  async getTrustQueue() {
    return this.getContentQuery.getTrustQueue();
  }

  @Get('live')
  @RequireStaffPermissions('live')
  async getLiveStreams(@Query() query: AdminQueryDto) {
    return this.getLiveStreamsQuery.execute(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Post('live/:id/end')
  @RequireStaffPermissions('live')
  async endLiveStream(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.endLiveStreamUseCase.execute(req.user.userId, id);
  }
}
