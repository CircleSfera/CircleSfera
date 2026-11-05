import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { ReviewViewLogInterceptor } from './review-view-log.interceptor.js';

@Module({
  controllers: [ReviewController],
  providers: [ReviewService, ReviewViewLogInterceptor],
})
export class ReviewModule {}
