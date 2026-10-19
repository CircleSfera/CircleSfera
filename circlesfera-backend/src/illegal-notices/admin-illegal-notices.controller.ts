import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IllegalNoticeStatus } from '@prisma/client';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { DecideIllegalNoticeDto } from './dto/decide-illegal-notice.dto.js';
import { IllegalNoticePageDto } from './dto/illegal-notice-page.dto.js';
import { IllegalNoticesService } from './illegal-notices.service.js';

// Staff who decide reports decide the notices too.
@Controller('admin/illegal-content-notices')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminIllegalNoticesController {
  constructor(
    @Inject(IllegalNoticesService)
    private readonly notices: IllegalNoticesService,
  ) {}

  @RequireStaffPermissions('reports')
  @Get()
  list(@Query('status') status?: string) {
    const known = Object.values(IllegalNoticeStatus) as string[];
    return this.notices.list(
      status && known.includes(status)
        ? (status as IllegalNoticeStatus)
        : undefined,
    );
  }

  // A tab a page at a time, most recent first.
  @RequireStaffPermissions('reports')
  @Get('page')
  page(@Query() q: IllegalNoticePageDto) {
    return this.notices.listPage(q.status, q.cursor, q.limit);
  }

  @RequireStaffPermissions('reports')
  @Post(':id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideIllegalNoticeDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.notices.decide(admin.adminId, id, dto);
  }
}
