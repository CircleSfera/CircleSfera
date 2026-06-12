import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
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
      console.log('SubscriptionGuard: No user found on request');
      return false;
    }

    // 1. Fetch fresh user data to ensure role is correct
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { role: true },
    });

    console.log(
      `SubscriptionGuard: DB Role for ${user.userId} is "${dbUser?.role}"`,
    );

    // Administrators bypass subscription requirements
    const currentRole = (dbUser?.role as string) || (user.role as string);
    if (currentRole === 'ADMIN') {
      console.log('SubscriptionGuard: ADMIN bypass granted');
      return true;
    }

    // Define plan hierarchy
    const planHierarchy = ['Premium', 'Elite Creator', 'Business'];
    const requiredLevel = planHierarchy.indexOf(requiredPlan);

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

    const userLevel = planHierarchy.indexOf(userSubscription.plan.name);

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(
        `Your current plan '${userSubscription.plan.name}' is not sufficient. This feature requires at least '${requiredPlan}'.`,
      );
    }

    return true;
  }
}
