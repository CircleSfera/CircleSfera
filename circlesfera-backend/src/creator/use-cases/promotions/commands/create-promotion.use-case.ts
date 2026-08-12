import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionStatus, PromotionTargetType } from '@prisma/client';
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
    budget?: number,
    currency = 'EUR',
    objective = 'PROFILE_VISITS',
    interests?: string,
    countries?: string,
    dailyBudget?: number,
  ) {
    if (targetType === 'post' || targetType === 'frame') {
      const post = await this.prisma.post.findFirst({
        where: { id: targetId, userId },
      });
      if (!post) throw new Error('Post not found or not owned by user');
    } else if (targetType === 'story') {
      const story = await this.prisma.story.findFirst({
        where: { id: targetId, userId },
      });
      if (!story) throw new Error('Story not found or not owned by user');
    } else if (targetType === 'profile') {
      if (targetId !== userId)
        throw new Error('Cannot promote other users profile');
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

    const finalBudget =
      budget || (dailyBudget ? dailyBudget * durationDays : 0);

    const promotion = await this.prisma.promotion.create({
      data: {
        userId,
        targetType:
          typeMap[targetType.toLowerCase()] || PromotionTargetType.POST,
        targetId,
        budget: finalBudget,
        dailyBudget,
        currency,
        endDate,
        objective,
        interests,
        countries,
        status: PromotionStatus.PENDING,
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const session = await this.stripeService.createCheckoutSession({
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Promotion: ${targetType.toUpperCase()}`,
              description: `Boost for ${durationDays} days`,
            },
            unit_amount: Math.round(finalBudget * 100),
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
