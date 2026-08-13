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
  Res,
  UseGuards,
} from '@nestjs/common';
import { type PromotionStatus, type ReportStatus } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { ReassignReportDto } from './dto/reassign-report.dto.js';
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

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
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
      query.userId,
      query.moderationStatus,
    );
  }

  @RequireStaffPermissions('content')
  @Delete('posts/:id')
  async deletePost(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deletePostUseCase.execute(admin.adminId, id);
  }

  @RequireStaffPermissions('reports')
  @Get('reports')
  async getReports(@Query() query: AdminQueryDto) {
    return this.getReportsQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.status,
      query.userId,
      query.assignedAdminId,
    );
  }

  @Patch('reports/:id')
  @RequireStaffPermissions('reports')
  async updateReport(
    @Param('id') id: string,
    @Body('status') status: ReportStatus,
    @Body('internalNotes') internalNotes: string | undefined,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.updateStatus(
      admin.adminId,
      id,
      status,
      internalNotes,
    );
  }

  @Post('reports/:id/claim')
  @RequireStaffPermissions('reports')
  async claimReport(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.claim(admin.adminId, id);
  }

  @Post('reports/:id/unclaim')
  @RequireStaffPermissions('reports')
  async unclaimReport(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.unclaim(admin.adminId, id);
  }

  @Post('reports/:id/reassign')
  @RequireStaffPermissions('reports')
  async reassignReport(
    @Param('id') id: string,
    @Body() body: ReassignReportDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.reassign(admin.adminId, id, body.toAdminId);
  }

  @Post('reports/:id/resolve-penalty')
  @RequireStaffPermissions('reports')
  async resolveReportWithPenalty(
    @Param('id') id: string,
    @Body('action') action: 'IGNORE' | 'STRIKE' | 'BAN',
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.resolveWithPenalty(
      admin.adminId,
      id,
      action,
    );
  }

  @Post('reports/bulk')
  @RequireStaffPermissions('reports')
  async bulkUpdateReports(
    @Body() body: { ids: string[]; status: ReportStatus },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.bulkUpdate(
      admin.adminId,
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
      query.userId,
      query.moderationStatus,
    );
  }

  @RequireStaffPermissions('content')
  @Delete('comments/:id')
  async deleteComment(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deleteCommentUseCase.execute(admin.adminId, id);
  }

  @RequireStaffPermissions('content')
  @Get('stories')
  async getStories(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getStories(query.page ?? 1, query.limit ?? 10, {
      moderationStatus: query.moderationStatus,
      expired: query.expired,
      userId: query.userId,
    });
  }

  @RequireStaffPermissions('content')
  @Delete('stories/:id')
  async deleteStory(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deleteStoryUseCase.execute(admin.adminId, id);
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
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewPromotionUseCase.execute(admin.adminId, id, status, note);
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
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.moderateContentUseCase.execute(
      admin.adminId,
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
      query.userId,
    );
  }

  @Post('live/:id/end')
  @RequireStaffPermissions('live')
  async endLiveStream(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.endLiveStreamUseCase.execute(admin.adminId, id);
  }
}
