import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { CspReportStore } from '../security-reports/csp-report.store.js';
import { OrphanFilesReportService } from './orphan-files-report.service.js';
import { ServerResourcesService } from './server-resources.service.js';
import { WarehouseReportService } from './warehouse-report.service.js';

/**
 * The Operations page of the Backoffice (ED-016): the read-only reports that
 * were manual workflows. Staff with the system permission only. Each answer
 * holds counts, sizes, ratios and dates: never a person's data, an address
 * or a setting.
 */
@Controller('admin/operations')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('system')
export class OperationsController {
  constructor(
    @Inject(ServerResourcesService)
    private readonly resources: ServerResourcesService,
    @Inject(WarehouseReportService)
    private readonly warehouse: WarehouseReportService,
    @Inject(CspReportStore) private readonly csp: CspReportStore,
    @Inject(OrphanFilesReportService)
    private readonly orphans: OrphanFilesReportService,
  ) {}

  @Get('resources')
  @ApiResponse({ status: 200 })
  getResources() {
    return this.resources.collect();
  }

  @Get('warehouse')
  @ApiResponse({ status: 200 })
  getWarehouse() {
    return this.warehouse.report();
  }

  @Get('csp')
  @ApiResponse({ status: 200 })
  getCspSummary() {
    return this.csp.summary();
  }

  @Get('orphan-files')
  @ApiResponse({ status: 200 })
  getOrphanFiles() {
    return this.orphans.report();
  }
}
