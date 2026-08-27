import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REQUIRES_PLAN_KEY } from '../decorators/requires-plan.decorator.js';

interface RequestWithUser extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.getAllAndOverride<string>(
      REQUIRES_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPlan) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user?.userId) {
      this.logger.warn('SubscriptionGuard: No user found on request');
      return false;
    }

    // 1. Fetch fresh user data to ensure role is correct
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true },
    });

    // Administrators bypass subscription requirements
    const currentRole = (dbUser?.role as string) || (user.role as string);
    if (currentRole === 'ADMIN') {
      return true;
    }

    // Fetch the required plan details dynamically to determine its tier (using price as rank)
    const dbRequiredPlan = await this.prisma.platformPlan.findFirst({
      where: { name: requiredPlan },
    });

    if (!dbRequiredPlan) {
      this.logger.error(
        `Required plan '${requiredPlan}' does not exist in the database.`,
      );
      return false;
    }

    // Check for active subscription
    const userSubscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId: user.userId,
        status: SubscriptionStatus.ACTIVE,
      },
      include: {
        plan: true,
      },
    });

    if (!userSubscription) {
      throw new ForbiddenException(
        `This feature requires an active '${requiredPlan}' subscription.`,
      );
    }

    // Compare prices to determine if the user's plan is equal or higher tier
    if (userSubscription.plan.priceCents < dbRequiredPlan.priceCents) {
      throw new ForbiddenException(
        `Your current plan '${userSubscription.plan.name}' is not sufficient. This feature requires at least '${requiredPlan}'.`,
      );
    }

    return true;
  }
}
