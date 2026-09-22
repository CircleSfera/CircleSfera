import type {
  PlatformPlan,
  PlatformSubscription,
  PostUnlock,
  PrismaClient,
  SubscriptionStatus,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { generateTestSuffix } from './user.factory.js';

export interface PlatformPlanOverrides {
  name?: string;
  priceCents?: number;
  currency?: string;
  interval?: string;
  features?: string[];
  stripeProductId?: string;
  stripePriceId?: string;
}

/**
 * Create a deterministic PlatformPlan in the database.
 */
export async function createPlatformPlan(
  prisma: PrismaClient,
  overrides: PlatformPlanOverrides = {},
): Promise<PlatformPlan> {
  const suffix = generateTestSuffix();
  return prisma.platformPlan.create({
    data: {
      name: overrides.name ?? `Creator Pro ${suffix}`,
      priceCents: overrides.priceCents ?? 999, // €9.99
      currency: overrides.currency ?? 'EUR',
      interval: overrides.interval ?? 'month',
      features: overrides.features ?? [
        'HD Video',
        'Exclusive Content',
        'Direct Messaging',
      ],
      stripeProductId: overrides.stripeProductId ?? `prod_test_${suffix}`,
      stripePriceId: overrides.stripePriceId ?? `price_test_${suffix}`,
      isActive: true,
    },
  });
}

/**
 * Create a PlatformSubscription for a user.
 */
export async function createPlatformSubscription(
  prisma: PrismaClient,
  userId: string,
  planId: string,
  options: {
    profileId?: string;
    status?: SubscriptionStatus;
    stripeSubscriptionId?: string;
  } = {},
): Promise<PlatformSubscription> {
  const suffix = generateTestSuffix();
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return prisma.platformSubscription.create({
    data: {
      userId,
      planId,
      profileId: options.profileId,
      status: options.status ?? 'ACTIVE',
      stripeSubscriptionId:
        options.stripeSubscriptionId ?? `sub_test_${suffix}`,
      currentPeriodStart: now,
      currentPeriodEnd: end,
    },
  });
}

/**
 * Unlock a PPV post on behalf of a user.
 */
export async function createPostUnlock(
  prisma: PrismaClient,
  userId: string,
  postId: string,
  pricePaid = 499,
): Promise<PostUnlock> {
  return prisma.postUnlock.upsert({
    where: {
      userId_postId: {
        userId,
        postId,
      },
    },
    create: {
      userId,
      postId,
      pricePaid,
    },
    update: {
      pricePaid,
    },
  });
}

/**
 * Create a financial ledger transaction between two users.
 */
export async function createTransaction(
  prisma: PrismaClient,
  senderId: string,
  receiverId: string,
  options: {
    amountCents?: number;
    amount?: number;
    type?: TransactionType;
    status?: TransactionStatus;
  } = {},
): Promise<Transaction> {
  const suffix = generateTestSuffix();
  return prisma.transaction.create({
    data: {
      senderId,
      receiverId,
      amount: options.amount ?? options.amountCents ?? 1000,
      type: options.type ?? 'DIRECT_POST_UNLOCK',
      status: options.status ?? 'COMPLETED',
      currency: 'EUR',
      stripePaymentIntentId: `pi_test_${suffix}`,
    },
  });
}
