import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
  staffHoldsPermission,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  CreateSavedReplyDto,
  UpdateSavedReplyDto,
} from './dto/saved-reply.dto.js';
import {
  HelpdeskSavedRepliesService,
  type SavedReplyActor,
} from './helpdesk-saved-replies.service.js';

// The saved replies of an agent, behind the staff session and the support
// permission. Whether the agent leads the team is read from who is signed
// in, never from the request.
@Controller('admin/support/saved-replies')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('support')
export class HelpdeskSavedRepliesController {
  constructor(
    @Inject(HelpdeskSavedRepliesService)
    private readonly replies: HelpdeskSavedRepliesService,
  ) {}

  private actor(admin: CurrentAdminData): SavedReplyActor {
    return {
      ref: admin.adminId,
      canManage: staffHoldsPermission(admin, 'support.manage'),
    };
  }

  // The shared ones and the agent's own.
  @Get()
  async list(@CurrentAdmin() admin: CurrentAdminData) {
    return this.replies.list(admin.adminId);
  }

  @Post()
  async create(
    @Body() dto: CreateSavedReplyDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.replies.create(this.actor(admin), dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSavedReplyDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.replies.update(this.actor(admin), id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.replies.remove(this.actor(admin), id);
  }
}
