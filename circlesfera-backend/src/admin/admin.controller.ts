import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAction,
  type PromotionStatus,
  type ReportStatus,
} from '@prisma/client';
import type { Request, Response } from 'express';
import { AudioService } from '../audio/audio.service.js';
import { CreateAudioDto } from '../audio/dto/create-audio.dto.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminService } from './admin.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { BroadcastEmailDto } from './dto/broadcast-email.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateWhitelistEntryDto } from './dto/update-whitelist-entry.dto.js';

/** Extend Express Request with the authenticated user payload. */
interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(AudioService) private readonly audioService: AudioService,
  ) {}

  // ─── Statistics ───────────────────────────────────────────────────

  /** Basic stats (backwards compatible). */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats() {
    return this.adminService.getStats();
  }

  /** Enhanced stats with growth percentages and engagement metrics. */
  @Get('stats/enhanced')
  @HttpCode(HttpStatus.OK)
  async getEnhancedStats() {
    return this.adminService.getEnhancedStats();
  }

  /** System health metrics (Database, AI Queues, Stripe Webhooks). */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  /** Send a broadcast email to all active users. */
  @Post('broadcast')
  async sendBroadcast(@Body() dto: BroadcastEmailDto, @Req() req: AuthRequest) {
    return this.adminService.sendBroadcastEmail(req.user.userId, dto);
  }

  // ─── Users ────────────────────────────────────────────────────────

  /** Export all users as CSV — must be ABOVE :id routes. */
  @Get('users/export')
  async exportUsersCSV(@Res() res: Response) {
    const csv = await this.adminService.exportUsersCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=circlesfera-users.csv',
    );
    res.send(csv);
  }

  /** Paginated user list with optional search and status filter. */
  @Get('users')
  async getUsers(@Query() query: AdminQueryDto) {
    return this.adminService.getUsers(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.status,
    );
  }

  /** Ban a user. */
  @Patch('users/:id/ban')
  async banUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.banUser(req.user.userId, id);
  }

  /** Unban a user. */
  @Patch('users/:id/unban')
  async unbanUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.unbanUser(req.user.userId, id);
  }

  /** Promote user to admin role. */
  @Patch('users/:id/promote')
  async promoteUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.promoteUser(req.user.userId, id);
  }

  /** Demote user from admin to regular user. */
  @Patch('users/:id/demote')
  async demoteUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.demoteUser(req.user.userId, id);
  }
  /** Update user status (verification level, account type, active status). */
  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body()
    data: UpdateUserStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateUserStatus(req.user.userId, id, data);
  }

  /** Revoke Stripe Identity KYC status. */
  @Post('users/:id/revoke-kyc')
  async revokeUserKYC(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.revokeUserKYC(req.user.userId, id);
  }

  /** Hard-delete a user account. */
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deleteUser(req.user.userId, id);
  }

  /** Paginated whitelist list with optional search. */
  @Get('whitelist')
  async getWhitelist(@Query() query: AdminQueryDto) {
    return this.adminService.getWhitelist(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
    );
  }

  /** Update a whitelist entry. */
  @Patch('whitelist/:id')
  async updateWhitelist(
    @Param('id') id: string,
    @Body() data: UpdateWhitelistEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateWhitelist(req.user.userId, id, data);
  }

  /** Delete a whitelist entry. */
  @Delete('whitelist/:id')
  async deleteWhitelist(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deleteWhitelist(req.user.userId, id);
  }

  // ─── Posts ────────────────────────────────────────────────────────

  /** Export all posts as CSV — must be ABOVE :id routes. */
  @Get('posts/export')
  async exportPostsCSV(@Res() res: Response) {
    const csv = await this.adminService.exportPostsCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=circlesfera-posts.csv',
    );
    res.send(csv);
  }

  /** Paginated post list with optional search and type filter. */
  @Get('posts')
  async getPosts(@Query() query: AdminQueryDto) {
    return this.adminService.getPosts(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.type,
    );
  }

  /** Delete a post (admin moderation). */
  @Delete('posts/:id')
  async deletePost(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deletePost(req.user.userId, id);
  }

  // ─── Reports ──────────────────────────────────────────────────────

  /** Paginated reports with optional search and status filter. */
  @Get('reports')
  async getReports(@Query() query: AdminQueryDto) {
    return this.adminService.getReports(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.status,
    );
  }

  /** Update a report's status (resolve/dismiss). */
  @Patch('reports/:id')
  async updateReport(
    @Param('id') id: string,
    @Body('status') status: ReportStatus,
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateReportStatus(req.user.userId, id, status);
  }

  // ─── Audit Logs ───────────────────────────────────────────────────

  /** Paginated audit logs for admin accountability. */
  @Get('audit-logs')
  async getAuditLogs(@Query() query: AdminQueryDto) {
    return this.adminService.getAuditLogs(query.page ?? 1, query.limit ?? 20);
  }

  // ─── Activity Chart ──────────────────────────────────────────────

  /** Posts and new users grouped by day (last 14 days). */
  @Get('stats/activity-chart')
  async getActivityChart() {
    return this.adminService.getActivityChart();
  }

  /** Top 5 users by engagement (likes + comments). */
  @Get('stats/top-users')
  async getTopUsers() {
    return this.adminService.getTopUsers();
  }

  // ─── Hashtags ────────────────────────────────────────────────────

  /** Paginated hashtags sorted by post count. */
  @Get('hashtags')
  async getHashtags(@Query() query: AdminQueryDto) {
    return this.adminService.getHashtags(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  // ─── Comments ────────────────────────────────────────────────────

  /** Paginated comments with author and post info. */
  @Get('comments')
  async getComments(@Query() query: AdminQueryDto) {
    return this.adminService.getComments(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
    );
  }

  /** Delete a comment (admin moderation). */
  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deleteComment(req.user.userId, id);
  }

  // ─── Stories ─────────────────────────────────────────────────────

  /** Paginated stories with view counts. */
  @Get('stories')
  async getStories(@Query() query: AdminQueryDto) {
    return this.adminService.getStories(query.page ?? 1, query.limit ?? 10);
  }

  /** Delete a story (admin moderation). */
  @Delete('stories/:id')
  async deleteStory(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deleteStory(req.user.userId, id);
  }

  // ─── User Detail ─────────────────────────────────────────────────

  /** Enriched user detail with followers, posts, reports. */
  @Get('users/:id/detail')
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  // ─── Analytics ───────────────────────────────────────────────────

  /** Global Monetization Analytics (Forces linter refresh on TS Server) */
  @Get('analytics/monetization')
  async getMonetizationAnalytics() {
    return await this.adminService.getMonetizationAnalytics();
  }

  // ─── Audio Management ────────────────────────────────────────────

  /** List all audio tracks (paginated, searchable). */
  @Get('audio')
  async getAudio(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.audioService.findAllPaginated(+page, +limit, search);
  }

  /** Create a new audio track. */
  @Post('audio')
  async createAudio(@Body() dto: CreateAudioDto, @Req() req: AuthRequest) {
    const result = await this.audioService.create(dto);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.CREATE_AUDIO,
      'audio',
      result.id,
      `Track: ${dto.title} by ${dto.artist}`,
    );
    return result;
  }

  /** Update an audio track. */
  @Patch('audio/:id')
  async updateAudio(
    @Param('id') id: string,
    @Body() dto: CreateAudioDto,
    @Req() req: AuthRequest,
  ) {
    const result = await this.audioService.update(id, dto);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.UPDATE_AUDIO,
      'audio',
      id,
      `Updated track: ${dto.title}`,
    );
    return result;
  }

  /** Delete an audio track. */
  @Delete('audio/:id')
  async deleteAudio(@Param('id') id: string, @Req() req: AuthRequest) {
    const result = await this.audioService.delete(id);
    await this.adminService.logAction(
      req.user.userId,
      AdminAction.DELETE_AUDIO,
      'audio',
      id,
    );
    return result;
  }

  // ─── Promotions ──────────────────────────────────────────────────

  /** Paginated list of promotions for approval. */
  @Get('promotions')
  async getPromotions(@Query() query: AdminQueryDto) {
    return this.adminService.getPromotions(
      query.page ?? 1,
      query.limit ?? 10,
      query.status as PromotionStatus,
      query.search,
    );
  }

  /** Update promotion status (Approve/Reject). */
  @Patch('promotions/:id')
  async updatePromotionStatus(
    @Param('id') id: string,
    @Body('status') status: PromotionStatus,
    @Body('note') note: string,
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updatePromotionStatus(
      req.user.userId,
      id,
      status,
      note,
    );
  }

  // ─── Moderation Management ────────────────────────────────────────

  /** Get a list of flagged/hidden content for review. */
  @Get('moderation/queue')
  async getModerationQueue(@Query() query: AdminQueryDto) {
    return this.adminService.getModerationQueue(
      query.page ?? 1,
      query.limit ?? 10,
      query.type,
      query.search,
    );
  }

  /** Update moderation status for a post, story, or comment. */
  @Patch('moderation/:type/:id')
  async updateModerationStatus(
    @Param('type') type: 'POST' | 'STORY' | 'COMMENT',
    @Param('id') id: string,
    @Body('status') status: 'VISIBLE' | 'HIDDEN' | 'REMOVED',
    @Body('note') note: string,
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateModerationStatus(
      req.user.userId,
      type,
      id,
      status,
      note,
    );
  }
}
