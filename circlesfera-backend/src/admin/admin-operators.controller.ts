import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AdminOperatorsService } from './admin-operators.service.js';
import {
  CreateAdminOperatorDto,
  ListAdminOperatorsQueryDto,
  ReplaceAdminOperatorRolesDto,
  ResetAdminOperatorPasswordDto,
  UpdateAdminOperatorStatusDto,
} from './dto/admin-operators.dto.js';

@Controller('admin/operators')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('admins.manage')
export class AdminOperatorsController {
  constructor(
    @Inject(AdminOperatorsService)
    private readonly operatorsService: AdminOperatorsService,
  ) {}

  @Get('roles')
  listRoles() {
    return this.operatorsService.listRoles();
  }

  @Get()
  list(@Query() query: ListAdminOperatorsQueryDto) {
    return this.operatorsService.listOperators(
      Number(query.page) || 1,
      Number(query.limit) || 20,
      query.search,
      query.status,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.operatorsService.getOperator(id);
  }

  @Post()
  @RequireAdminStepUp()
  create(
    @CurrentAdmin() admin: CurrentAdminData,
    @Body() dto: CreateAdminOperatorDto,
  ) {
    return this.operatorsService.createOperator(admin.adminId, dto);
  }

  @Patch(':id/status')
  @RequireAdminStepUp()
  updateStatus(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
    @Body() dto: UpdateAdminOperatorStatusDto,
  ) {
    return this.operatorsService.updateStatus(admin.adminId, id, dto.status);
  }

  @Put(':id/roles')
  @RequireAdminStepUp()
  replaceRoles(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
    @Body() dto: ReplaceAdminOperatorRolesDto,
  ) {
    return this.operatorsService.replaceRoles(admin.adminId, id, dto.roleIds);
  }

  @Post(':id/reset-mfa')
  @RequireAdminStepUp()
  resetMfa(@CurrentAdmin() admin: CurrentAdminData, @Param('id') id: string) {
    return this.operatorsService.resetMfa(admin.adminId, id);
  }

  @Post(':id/reset-password')
  @RequireAdminStepUp()
  resetPassword(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
    @Body() dto: ResetAdminOperatorPasswordDto,
  ) {
    return this.operatorsService.resetPassword(admin.adminId, id, dto.password);
  }
}
