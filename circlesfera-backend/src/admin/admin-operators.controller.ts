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
import { ApiResponse } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200 })
  listRoles() {
    return this.operatorsService.listRoles();
  }

  @Get()
  @ApiResponse({ status: 200 })
  list(@Query() query: ListAdminOperatorsQueryDto) {
    return this.operatorsService.listOperators(
      Number(query.page) || 1,
      Number(query.limit) || 20,
      query.search,
      query.status,
    );
  }

  @Get(':id')
  @ApiResponse({ status: 200 })
  getOne(@Param('id') id: string) {
    return this.operatorsService.getOperator(id);
  }

  @Post()
  @RequireAdminStepUp()
  @ApiResponse({ status: 201 })
  create(
    @CurrentAdmin() admin: CurrentAdminData,
    @Body() dto: CreateAdminOperatorDto,
  ) {
    return this.operatorsService.createOperator(admin.adminId, dto);
  }

  @Patch(':id/status')
  @RequireAdminStepUp()
  @ApiResponse({ status: 200 })
  updateStatus(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
    @Body() dto: UpdateAdminOperatorStatusDto,
  ) {
    return this.operatorsService.updateStatus(admin.adminId, id, dto.status);
  }

  @Put(':id/roles')
  @RequireAdminStepUp()
  @ApiResponse({ status: 200 })
  replaceRoles(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
    @Body() dto: ReplaceAdminOperatorRolesDto,
  ) {
    return this.operatorsService.replaceRoles(admin.adminId, id, dto.roleIds);
  }

  @Post(':id/reset-mfa')
  @RequireAdminStepUp()
  @ApiResponse({ status: 201 })
  resetMfa(@CurrentAdmin() admin: CurrentAdminData, @Param('id') id: string) {
    return this.operatorsService.resetMfa(admin.adminId, id);
  }

  // Sends a new link to enrol the authenticator to the staff email.
  @Post(':id/enrolment-link')
  @RequireAdminStepUp()
  @ApiResponse({ status: 201 })
  sendEnrolmentLink(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
  ) {
    return this.operatorsService.sendEnrolmentLinkAgain(admin.adminId, id);
  }

  // A code to enrol the authenticator, handed over in person; shown once.
  @Post(':id/enrolment-code')
  @RequireAdminStepUp()
  @ApiResponse({ status: 201 })
  issueEnrolmentCode(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id') id: string,
  ) {
    return this.operatorsService.issueEnrolmentCode(admin.adminId, id);
  }

  @Post(':id/unlock')
  @RequireAdminStepUp()
  @ApiResponse({ status: 201 })
  unlock(@CurrentAdmin() admin: CurrentAdminData, @Param('id') id: string) {
    return this.operatorsService.unlock(admin.adminId, id);
  }
}
