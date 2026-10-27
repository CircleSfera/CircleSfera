import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionStatus, PromotionTargetType } from '@prisma/client';
import { eurosToCents } from '../../../../common/constants/monetization.constants.js';
import { withdrawalConsentMetadata } from '../../../../common/consumer/withdrawal-consent.js';
import { assertRealMoneyAllowed } from '../../../../common/policies/test-account.policy.js';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class CreatePromotionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async execute(
    userId: string,
    targetType: string,
    targetId: string,
    durationDays: number,
    dailyBudget: number,
    currency = 'EUR',
    countries?: string[],
  ) {
    await assertRealMoneyAllowed(this.prisma, userId);
    const ownedProfiles = await this.prisma.profile.findMany({
      where: { userId },
      select: { id: true },
    });
    const profileIds = ownedProfiles.map((p) => p.id);

    if (targetType === 'post' || targetType === 'frame') {
      // Content in Recently deleted or in the archive cannot be promoted.
      const post = await this.prisma.post.findFirst({
        where: {
          id: targetId,
          profileId: { in: profileIds },
          deletedAt: null,
          archivedAt: null,
        },
      });
      if (!post) throw new Error('Post not found or not owned by user');
    } else if (targetType === 'story') {
      const story = await this.prisma.story.findFirst({
        where: { id: targetId, profileId: { in: profileIds }, deletedAt: null },
      });
      if (!story) throw new Error('Story not found or not owned by user');
    } else if (targetType === 'profile') {
      if (!profileIds.includes(targetId)) {
        throw new Error('Cannot promote other users profile');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true },
    });

    if (!user) throw new Error('User not found');

    const typeMap: Record<string, PromotionTargetType> = {
      post: PromotionTargetType.POST,
      frame: PromotionTargetType.POST,
      story: PromotionTargetType.STORY,
      profile: PromotionTargetType.PROFILE,
    };

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // The whole budget is the budget per day times the days, worked out here
    // in cents: it is the amount charged.
    const dailyBudgetCents = eurosToCents(dailyBudget);
    const budgetCents = dailyBudgetCents * durationDays;

    const promotion = await this.prisma.promotion.create({
      data: {
        userId,
        targetType:
          typeMap[targetType.toLowerCase()] || PromotionTargetType.POST,
        targetId,
        budgetCents,
        dailyBudgetCents,
        currency,
        endDate,
        countries: countries?.length ? countries.join(',') : null,
        status: PromotionStatus.PENDING,
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const session = await this.stripeService.createCheckoutSession({
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      ...this.stripeService.cardOnlyPaymentMethods(),
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Promotion: ${targetType.toUpperCase()}`,
              description: `Promotion for ${durationDays} days`,
            },
            unit_amount: budgetCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${frontendUrl}/creator/ads?promotion=success&id=${promotion.id}`,
      cancel_url: `${frontendUrl}/creator/ads?promotion=cancelled`,
      metadata: {
        promotionId: promotion.id,
        userId: userId,
        type: 'PROMOTION',
        ...withdrawalConsentMetadata(),
      },
    });

    await this.prisma.promotion.update({
      where: { id: promotion.id },
      data: { stripePaymentIntentId: session.id },
    });

    return {
      url: session.url,
      promotionId: promotion.id,
    };
  }
}
