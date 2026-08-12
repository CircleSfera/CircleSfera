import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Report, ReportStatus } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateReportDto } from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';

/** REST controller for content/user reports. Auth required; admin-only for list/update. */
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reportsService: ReportsService,
  ) {}

  /** File a new report. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateReportDto,
  ): Promise<Report> {
    return await this.reportsService.create(user.userId, dto);
  }

  /** List reports filed by the current user. */
  @Get('me')
  async findMyReports(
    @CurrentUser() user: CurrentUserData,
    @Query() pagination: PaginationDto,
  ) {
    return this.reportsService.findMyReports(user.userId, pagination);
  }

  /** List all reports (admin only). */
  @Get()
  @UseGuards(AdminGuard)
  @RequireStaffPermissions('reports')
  async findAll(@Query() pagination: PaginationDto): Promise<any> {
    return this.reportsService.findAll(pagination);
  }

  /** Update a report's status (admin only). */
  @Patch(':id')
  @UseGuards(AdminGuard)
  @RequireStaffPermissions('reports')
  async update(
    @Param('id') id: string,
    @Body('status') status: ReportStatus,
    @CurrentUser() user: CurrentUserData,
  ): Promise<Report> {
    return this.reportsService.update(id, status, user.userId);
  }
}
