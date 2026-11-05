import {
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ReviewEnforcementDto,
  ReviewPageDto,
  ReviewPaidContentDto,
} from './dto/review-page.dto.js';
import { ReviewService } from './review.service.js';
import { ReviewViewLogInterceptor } from './review-view-log.interceptor.js';

// The review area of the staff panel: read only, for external reviewers and
// the staff who hold the review permission. Every page opened is written down.
@Controller('admin/review')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('review')
@UseInterceptors(ReviewViewLogInterceptor)
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly review: ReviewService) {}

  @Get('summary')
  @ApiResponse({ status: 200 })
  summary() {
    return this.review.summary();
  }

  @Get('paid-content')
  @ApiResponse({ status: 200 })
  paidContent(@Query() q: ReviewPaidContentDto) {
    return this.review.paidContent(q.kind, q.page, q.limit);
  }

  @Get('creators')
  @ApiResponse({ status: 200 })
  creators(@Query() q: ReviewPageDto) {
    return this.review.creators(q.page, q.limit);
  }

  @Get('enforcement')
  @ApiResponse({ status: 200 })
  enforcement(@Query() q: ReviewEnforcementDto) {
    return this.review.enforcement(q.kind, q.page, q.limit);
  }
}
