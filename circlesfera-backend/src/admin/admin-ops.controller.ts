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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOpsController {
  constructor(
    @Inject(AdminOpsService)
    private readonly adminOpsService: AdminOpsService,
  ) {}

  @RequireStaffPermissions('moderation')
  @Get('firewall')
  async getFirewallSignatures(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getFirewallSignatures(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @RequireStaffPermissions('moderation')
  @Post('firewall')
  async addFirewallSignature(
    @Body() body: { text: string; category: string },
    @Req() req: AuthRequest,
  ) {
    return this.adminOpsService.addFirewallSignature(
      req.user.userId,
      body.text,
      body.category,
    );
  }

  @RequireStaffPermissions('moderation')
  @Delete('firewall/:id')
  async deleteFirewallSignature(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    return this.adminOpsService.deleteFirewallSignature(req.user.userId, id);
  }

  @RequireStaffPermissions('experiments')
  @Get('experiments/users')
  async getUserExperiments(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getUserExperiments(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  @RequireStaffPermissions('experiments')
  @Post('experiments/users')
  async assignUserExperiment(
    @Body() body: { userId: string; experimentKey: string; variant: string },
    @Req() req: AuthRequest,
  ) {
    return this.adminOpsService.assignUserExperiment(
      req.user.userId,
      body.userId,
      body.experimentKey,
      body.variant,
    );
  }

  @RequireStaffPermissions('experiments')
  @Delete('experiments/users/:id')
  async removeUserExperiment(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminOpsService.removeUserExperiment(req.user.userId, id);
  }

  @RequireStaffPermissions('support')
  @Get('support/tickets')
  async getSupportTickets(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getSupportTickets(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @RequireStaffPermissions('support')
  @Patch('support/tickets/:id')
  async updateSupportTicket(
    @Param('id') id: string,
    @Body() body: { status?: 'OPEN' | 'RESOLVED' | 'CLOSED'; reply?: string },
    @Req() req: AuthRequest,
  ) {
    return this.adminOpsService.updateSupportTicket(req.user.userId, id, body);
  }

  @Get('feature-flags')
  @RequireStaffPermissions('experiments')
  async listFeatureFlags() {
    return this.adminOpsService.listFeatureFlags();
  }

  @Put('feature-flags/:key')
  @RequireStaffPermissions('experiments')
  async upsertFeatureFlag(
    @Param('key') key: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      percentage?: number;
    },
    @Req() req: AuthRequest,
  ) {
    return this.adminOpsService.upsertFeatureFlag(req.user.userId, {
      key,
      ...body,
    });
  }

  @Delete('feature-flags/:key')
  @RequireStaffPermissions('experiments')
  @HttpCode(HttpStatus.OK)
  async deleteFeatureFlag(@Param('key') key: string, @Req() req: AuthRequest) {
    return this.adminOpsService.deleteFeatureFlag(req.user.userId, key);
  }

  @Get('webhooks')
  @RequireStaffPermissions('payments')
  async getWebhookEvents(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getWebhookEvents(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Get('webhooks/:id')
  @RequireStaffPermissions('payments')
  async getWebhookEvent(@Param('id') id: string) {
    return this.adminOpsService.getWebhookEvent(id);
  }

  @Post('webhooks/:id/replay')
  @RequireStaffPermissions('payments')
  async replayWebhookEvent(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminOpsService.replayWebhookEvent(req.user.userId, id);
  }
}
