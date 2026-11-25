import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { DecideFoundingCreatorDto } from './dto/decide-founding-creator.dto.js';
import { FoundingCreatorsReviewService } from './founding-creators-review.service.js';

// The Backoffice queue of founding creator applications, for staff with the
// founding-creators permission: approving one gives a plan for free.
@Controller('admin/founding-creators')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('founding_creators')
export class AdminFoundingCreatorsController {
  constructor(
    @Inject(FoundingCreatorsReviewService)
    private readonly review: FoundingCreatorsReviewService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  queue() {
    return this.review.queue();
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  decide(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideFoundingCreatorDto,
  ) {
    return this.review.decide(admin.adminId, id, dto);
  }
}
