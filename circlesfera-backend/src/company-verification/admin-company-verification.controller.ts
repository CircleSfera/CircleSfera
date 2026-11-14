import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { CompanyVerificationReviewService } from './company-verification-review.service.js';
import { DecideCompanyDto } from './dto/decide-company.dto.js';

// The Backoffice queue of company verifications, for staff with the
// company-verification permission.
@Controller('admin/company-verifications')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('company_verification')
export class AdminCompanyVerificationController {
  constructor(
    @Inject(CompanyVerificationReviewService)
    private readonly review: CompanyVerificationReviewService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  queue() {
    return this.review.queue();
  }

  @Get(':id')
  @ApiResponse({ status: 200 })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.review.detail(id);
  }

  // The verified identity's name of a sole trader, to match the documents.
  @Get(':id/identity-name')
  @Header('Cache-Control', 'no-store')
  @ApiResponse({ status: 200 })
  identityName(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.review.identityName(admin.adminId, id);
  }

  // A document, shown in the Backoffice only: never cached, never sniffed,
  // never run as a page.
  @Get(':id/documents/:documentId')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @ApiResponse({ status: 200 })
  async document(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ) {
    const file = await this.review.document(admin.adminId, id, documentId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.send(file.content);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  decide(
    @CurrentAdmin() admin: CurrentAdminData,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideCompanyDto,
  ) {
    return this.review.decide(admin.adminId, id, dto);
  }
}
