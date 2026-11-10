import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionStatus, PromotionTargetType } from '@prisma/client';
import { eurosToCents } from '../../../../common/constants/monetization.constants.js';
import { withdrawalConsentMetadata } from '../../../../common/consumer/withdrawal-consent.js';
import { AppException } from '../../../../common/errors/app.exception.js';
import { assertAdultPayer } from '../../../../common/policies/adult-payer.policy.js';
import {
  AWAITING_MODERATION,
  SELLABLE_POST,
  SELLABLE_STORY,
} from '../../../../common/policies/removed-content.policy.js';
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

  // One's own content still waiting for automatic moderation: promoted once
  // it is checked, so the person is told to wait rather than that it is gone.
  private async assertNotAwaitingModeration(
    kind: 'post' | 'story',
    owned: { id: string; profileId: { in: string[] } },
  ): Promise<void> {
    const where = { ...owned, ...AWAITING_MODERATION, deletedAt: null };
    const waiting =
      kind === 'post'
        ? await this.prisma.post.findFirst({ where, select: { id: true } })
        : await this.prisma.story.findFirst({ where, select: { id: true } });
    if (waiting) {
      throw AppException.BadRequest(
        ErrorCode.CONTENT_UNDER_REVIEW,
        'This content can be promoted once it has been checked.',
      );
    }
  }

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
    await assertAdultPayer(this.prisma, userId);
    // Only Profiles in good standing promote: one banned, or suspended
    // now, pays for nothing, even while another Profile of the account
    // keeps it signed in.
    const ownedProfiles = await this.prisma.profile.findMany({
      where: {
        userId,
        isAccountBanned: false,
        OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: new Date() } }],
      },
      select: { id: true },
    });
    const profileIds = ownedProfiles.map((p) => p.id);

    // Only one's own content that automatic moderation checked and passed,
    // published, and not removed, deleted or archived, is promoted: the same
    // rule as what may be sold. Content waiting for that check is told so.
    const owned = { id: targetId, profileId: { in: profileIds } };
    if (targetType === 'post' || targetType === 'frame') {
      const post = await this.prisma.post.findFirst({
        where: { ...owned, ...SELLABLE_POST, scheduledStatus: 'PUBLISHED' },
        select: { id: true },
      });
      if (!post) {
        await this.assertNotAwaitingModeration('post', owned);
        throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
      }
    } else if (targetType === 'story') {
      const story = await this.prisma.story.findFirst({
        where: { ...owned, ...SELLABLE_STORY, scheduledStatus: 'PUBLISHED' },
        select: { id: true },
      });
      if (!story) {
        await this.assertNotAwaitingModeration('story', owned);
        throw AppException.NotFound(
          ErrorCode.STORY_NOT_FOUND,
          'Story not found',
        );
      }
    } else if (targetType === 'profile') {
      if (!profileIds.includes(targetId)) {
        throw AppException.NotFound(
          ErrorCode.PROFILE_NOT_FOUND,
          'Profile not found',
        );
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
