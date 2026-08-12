import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { MonetizationModule } from '../monetization/monetization.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CreatorController } from './creator.controller.js';

// Analytics
import { ExportAnalyticsCsvUseCase } from './use-cases/analytics/commands/export-analytics-csv.use-case.js';
import { GetAudienceRetentionQuery } from './use-cases/analytics/queries/get-audience-retention.query.js';
import { GetCreatorStatsQuery } from './use-cases/analytics/queries/get-creator-stats.query.js';
import { GetRevenueAnalyticsQuery } from './use-cases/analytics/queries/get-revenue-analytics.query.js';
import { GetTopContentQuery } from './use-cases/analytics/queries/get-top-content.query.js';

// Content
import { GetCreatorPostsQuery } from './use-cases/content/queries/get-creator-posts.query.js';
import { GetCreatorStoriesQuery } from './use-cases/content/queries/get-creator-stories.query.js';

// Promotions
import { CreatePromotionUseCase } from './use-cases/promotions/commands/create-promotion.use-case.js';
import { ManagePromotionUseCase } from './use-cases/promotions/commands/manage-promotion.use-case.js';
import { RecordPromotionInteractionUseCase } from './use-cases/promotions/commands/record-promotion-interaction.use-case.js';
import { RefundPromotionUseCase } from './use-cases/promotions/commands/refund-promotion.use-case.js';
import { GetPromotionsQuery } from './use-cases/promotions/queries/get-promotions.query.js';

@Module({
  imports: [PrismaModule, AnalyticsModule, MonetizationModule],
  controllers: [CreatorController],
  providers: [
    StripeService,
    // Analytics
    GetCreatorStatsQuery,
    GetRevenueAnalyticsQuery,
    GetAudienceRetentionQuery,
    GetTopContentQuery,
    ExportAnalyticsCsvUseCase,
    // Content
    GetCreatorPostsQuery,
    GetCreatorStoriesQuery,
    // Promotions
    GetPromotionsQuery,
    CreatePromotionUseCase,
    ManagePromotionUseCase,
    RecordPromotionInteractionUseCase,
    RefundPromotionUseCase,
  ],
  exports: [RefundPromotionUseCase],
})
export class CreatorModule {}
