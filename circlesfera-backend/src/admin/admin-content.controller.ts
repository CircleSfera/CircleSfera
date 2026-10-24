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
import { ApiParam, ApiResponse } from '@nestjs/swagger';
import { type PromotionStatus, type ReportStatus } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireAdminStepUp,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { BulkDeleteDto } from './dto/bulk-delete.dto.js';
import { ReassignReportDto } from './dto/reassign-report.dto.js';
import { ReviewPromotionDto } from './dto/review-promotion.dto.js';
import { SetHashtagHiddenDto } from './dto/set-hashtag-hidden.dto.js';
import { WarnLiveHostDto } from './dto/warn-live-host.dto.js';
import { BulkDeleteContentUseCase } from './use-cases/content/commands/bulk-delete-content.use-case.js';
import { DeleteCommentUseCase } from './use-cases/content/commands/delete-comment.use-case.js';
import { DeletePostUseCase } from './use-cases/content/commands/delete-post.use-case.js';
import { DeleteStoryUseCase } from './use-cases/content/commands/delete-story.use-case.js';
import { EndLiveStreamUseCase } from './use-cases/content/commands/end-live-stream.use-case.js';
import { ModerateContentUseCase } from './use-cases/content/commands/moderate-content.use-case.js';
import { ReviewPromotionUseCase } from './use-cases/content/commands/review-promotion.use-case.js';
import { ReviewReportUseCase } from './use-cases/content/commands/review-report.use-case.js';
import { SetHashtagHiddenUseCase } from './use-cases/content/commands/set-hashtag-hidden.use-case.js';
import { WarnLiveHostUseCase } from './use-cases/content/commands/warn-live-host.use-case.js';
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
    @Inject(BulkDeleteContentUseCase)
    private readonly bulkDeleteContent: BulkDeleteContentUseCase,
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
    @Inject(WarnLiveHostUseCase)
    private readonly warnLiveHostUseCase: WarnLiveHostUseCase,
    @Inject(SetHashtagHiddenUseCase)
    private readonly setHashtagHiddenUseCase: SetHashtagHiddenUseCase,
  ) {}

  @RequireStaffPermissions('content')
  @Get('posts/export')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
  async deletePost(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deletePostUseCase.execute(admin.adminId, id);
  }

  // Deleting cannot be undone: several at once ask the staff member to
  // confirm again.
  @RequireStaffPermissions('content')
  @RequireAdminStepUp()
  @Post('posts/bulk-delete')
  @ApiResponse({ status: 201 })
  async bulkDeletePosts(
    @Body() dto: BulkDeleteDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.bulkDeleteContent.posts(admin.adminId, dto.ids);
  }

  @RequireStaffPermissions('reports')
  @Get('reports')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 201 })
  async claimReport(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.claim(admin.adminId, id);
  }

  @Post('reports/:id/unclaim')
  @RequireStaffPermissions('reports')
  @ApiResponse({ status: 201 })
  async unclaimReport(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.unclaim(admin.adminId, id);
  }

  @Post('reports/:id/reassign')
  @RequireStaffPermissions('reports')
  @ApiResponse({ status: 201 })
  async reassignReport(
    @Param('id') id: string,
    @Body() body: ReassignReportDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewReportUseCase.reassign(admin.adminId, id, body.toAdminId);
  }

  @Post('reports/:id/resolve-penalty')
  @RequireStaffPermissions('reports')
  @ApiResponse({ status: 201 })
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
  @ApiResponse({ status: 201 })
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
  @ApiResponse({ status: 200 })
  async getHashtags(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getHashtags(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
      query.status === 'hidden',
    );
  }

  @RequireStaffPermissions('content')
  @Patch('hashtags/:id')
  @ApiResponse({ status: 200 })
  async setHashtagHidden(
    @Param('id') id: string,
    @Body() body: SetHashtagHiddenDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.setHashtagHiddenUseCase.execute(admin.adminId, id, body.hidden);
  }

  @RequireStaffPermissions('content')
  @Get('comments')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
  async deleteComment(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deleteCommentUseCase.execute(admin.adminId, id);
  }

  @RequireStaffPermissions('content')
  @RequireAdminStepUp()
  @Post('comments/bulk-delete')
  @ApiResponse({ status: 201 })
  async bulkDeleteComments(
    @Body() dto: BulkDeleteDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.bulkDeleteContent.comments(admin.adminId, dto.ids);
  }

  @RequireStaffPermissions('content')
  @Get('stories')
  @ApiResponse({ status: 200 })
  async getStories(@Query() query: AdminQueryDto) {
    return this.getContentQuery.getStories(query.page ?? 1, query.limit ?? 10, {
      moderationStatus: query.moderationStatus,
      expired: query.expired,
      userId: query.userId,
      search: query.search,
    });
  }

  @RequireStaffPermissions('content')
  @Delete('stories/:id')
  @ApiResponse({ status: 200 })
  async deleteStory(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.deleteStoryUseCase.execute(admin.adminId, id);
  }

  @RequireStaffPermissions('content')
  @Get('promotions')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
  async updatePromotionStatus(
    @Param('id') id: string,
    @Body() body: ReviewPromotionDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.reviewPromotionUseCase.execute(
      admin.adminId,
      id,
      body.status as PromotionStatus,
      body.note?.trim(),
    );
  }

  @RequireStaffPermissions('moderation')
  @Get('moderation/queue')
  @ApiResponse({ status: 200 })
  async getModerationQueue(@Query() query: AdminQueryDto) {
    return this.getModerationQueueQuery.execute(
      query.page ?? 1,
      query.limit ?? 10,
      query.type,
      query.search,
    );
  }

  @ApiParam({ name: 'type', enum: ['POST', 'STORY', 'COMMENT'] })
  @RequireStaffPermissions('moderation')
  @Patch('moderation/:type/:id')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
  async getTrustQueue() {
    return this.getContentQuery.getTrustQueue();
  }

  @Get('live')
  @RequireStaffPermissions('live')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 201 })
  async endLiveStream(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.endLiveStreamUseCase.execute(admin.adminId, id);
  }

  @Post('live/:id/warn')
  @RequireStaffPermissions('live')
  @ApiResponse({ status: 201 })
  async warnLiveHost(
    @Param('id') id: string,
    @Body() body: WarnLiveHostDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.warnLiveHostUseCase.execute(admin.adminId, id, body.reason);
  }
}
