import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminLinkDomainsService } from './admin-link-domains.service.js';
import { BlockLinkDomainDto } from './dto/block-link-domain.dto.js';
import { LinkDomainPageDto } from './dto/staff-list-page.dto.js';

// Domains no link on a story may point to: staff who moderate content keep
// them.
@Controller('admin/link-domains')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminLinkDomainsController {
  constructor(private readonly domains: AdminLinkDomainsService) {}

  @RequireStaffPermissions('content')
  @Get()
  list(@Query('search') search?: string) {
    return this.domains.list(search);
  }

  // The list a page at a time, in alphabetical order.
  @RequireStaffPermissions('content')
  @Get('page')
  page(@Query() q: LinkDomainPageDto) {
    return this.domains.listPage(q.search, q.cursor, q.limit);
  }

  @RequireStaffPermissions('content')
  @Post()
  block(
    @Body() dto: BlockLinkDomainDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.domains.block(admin.adminId, dto.domain, dto.reason);
  }

  @RequireStaffPermissions('content')
  @Delete(':id')
  unblock(@Param('id') id: string, @CurrentAdmin() admin: CurrentAdminData) {
    return this.domains.unblock(admin.adminId, id);
  }
}
