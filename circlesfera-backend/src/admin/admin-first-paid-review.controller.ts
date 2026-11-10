import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiParam, ApiResponse } from '@nestjs/swagger';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  AdminFirstPaidReviewService,
  type FirstPaidItemType,
} from './admin-first-paid-review.service.js';
import { ApproveFirstPaidDto } from './dto/approve-first-paid.dto.js';

const ITEM_TYPES = { POST: 'POST', STORY: 'STORY' } as const;

// The first paid posts and stories of each creator, passed by a person on
// staff before they are sold.
@Controller('admin/moderation/first-paid')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminFirstPaidReviewController {
  constructor(
    @Inject(AdminFirstPaidReviewService)
    private readonly firstPaidReview: AdminFirstPaidReviewService,
  ) {}

  @RequireStaffPermissions('moderation')
  @Get()
  @ApiResponse({ status: 200 })
  list() {
    return this.firstPaidReview.list();
  }

  @ApiParam({ name: 'type', enum: ['POST', 'STORY'] })
  @RequireStaffPermissions('moderation')
  @Post(':type/:id/approve')
  @HttpCode(200)
  @ApiResponse({ status: 200 })
  approve(
    @Param('type', new ParseEnumPipe(ITEM_TYPES)) type: FirstPaidItemType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveFirstPaidDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.firstPaidReview.approve(
      admin.adminId,
      type,
      id,
      body.editedAt ?? null,
    );
  }
}
