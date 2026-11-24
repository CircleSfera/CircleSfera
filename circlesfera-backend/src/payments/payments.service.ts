import { ErrorCode, type PaymentAlertEvent } from '@circlesfera/shared';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type Stripe from 'stripe';
import {
  ENTITLED_STATUSES,
  isEntitled,
} from '../common/constants/plan-features.constants.js';
import {
  PLAN_START_CONSENT_VERSION,
  planStartConsentMetadata,
  withdrawalDeadline,
} from '../common/consumer/withdrawal-consent.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  assertAdultPayer,
  assertIdentityForBadge,
} from '../common/policies/adult-payer.policy.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  classifyStripeError,
  isProviderErrorResponse,
  StripeService,
} from '../stripe/stripe.service.js';
import {
  type SubscriptionWithItems,
  subscriptionInterval,
  subscriptionPeriod,
} from '../stripe/subscription-period.js';
import { UsersService } from '../users/users.service.js';
import {
  isOneTimeCheckoutType,
  PaymentEventsService,
  type StripeDisputePayload,
  type StripeRefundedCharge,
} from './payment-events.service.js';

export const WEBHOOK_LEASE_DURATION_MS = 2 * 60 * 1000; // 2 minutes lease duration

// An amount kept in cents, written in euros with two decimals.
function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

// The part of `paidCents` for the time left of a period, in whole cents
// rounded down: paid x time left / length of the period. Nothing when the
// period has passed or has no length.
export function unusedPartCents(
  paidCents: number,
  periodStartMs: number,
  periodEndMs: number,
  nowMs: number,
): number {
  const length = periodEndMs - periodStartMs;
  if (paidCents <= 0 || length <= 0) return 0;
  const remaining = Math.min(length, Math.max(0, periodEndMs - nowMs));
  // In integers: cents times milliseconds can pass what a double holds
  // exactly.
  return Number(
    (BigInt(Math.trunc(paidCents)) * BigInt(Math.trunc(remaining))) /
      BigInt(Math.trunc(length)),
  );
}

// Text for a cell of a spreadsheet. A cell that starts like a formula is
// written as text, so a spreadsheet shows it instead of running it.
function csvText(value: string | null | undefined): string {
  const text = value ?? '';
  return /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
}

// The provider's states of a subscription that has ended for good.
const ENDED_AT_PROVIDER = ['canceled', 'incomplete_expired'];

// A withdrawal not finished is tried again after 5 minutes, then twice as
// long each time, at most 6 hours apart.
export function withdrawalRetryDelayMs(attempts: number): number {
  const minute = 60 * 1000;
  return Math.min(6 * 60 * minute, 5 * minute * 2 ** Math.max(0, attempts - 1));
}

// From this failed attempt on (attempts by then over an hour apart), a
// withdrawal that keeps failing is reported to the error tracker.
const WITHDRAWAL_REPORT_FROM_ATTEMPT = 5;
// A withdrawal not finished this long after it was made is reported too.
const WITHDRAWAL_REPORT_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

// A subscription as the provider describes it, in a notice or read again.
type StripeSubscriptionState = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
  // When it started (the purchase), in seconds.
  start_date?: number;
} & SubscriptionWithItems;

// A subscription read or changed to move it to another price: whether a
// change waits for its charge to be paid, and the invoice of that charge.
type SwitchedSubscription = StripeSubscriptionState & {
  pending_update?: unknown;
  latest_invoice?:
    | string
    | { status?: string | null; hosted_invoice_url?: string | null }
    | null;
};

// How long a request to move a plan to the yearly price holds the move.
const YEARLY_MOVE_CLAIM_MS = 2 * 60 * 1000;

// When a subscription started at the provider, to keep on its row.
function providerStart(
  subscription: { start_date?: number } | null | undefined,
): { providerStartedAt: Date } | Record<string, never> {
  return typeof subscription?.start_date === 'number'
    ? { providerStartedAt: new Date(subscription.start_date * 1000) }
    : {};
}

// How often a subscription is charged and what each period costs, to keep
// on its row; what the provider does not name, the row keeps.
function providerInterval(subscription: SubscriptionWithItems): {
  billingInterval?: 'month' | 'year';
  periodPriceCents?: number;
} {
  const interval = subscriptionInterval(subscription);
  const amount = subscription.items?.data?.[0]?.price?.unit_amount;
  return {
    ...(interval && { billingInterval: interval }),
    ...(typeof amount === 'number' && { periodPriceCents: amount }),
  };
}

// The mark a move to the yearly price leaves on the subscription at the
// provider: only a subscription with it moved from monthly, and only then
// does its year start a new 14 days to withdraw.
export const YEARLY_MOVE_METADATA_KEY = 'moved_to_yearly';

// Whether a plan checkout is for the add-on, so a newer payment page of the
// same Profile replaces only the older one of the same kind.
const CHECKOUT_ADD_ON_METADATA_KEY = 'addOn';

// The mark a second plan of a Profile gets at the provider before it ends,
// so a retried notice still refunds it.
const DUPLICATE_PLAN_METADATA_KEY = 'duplicate_plan';

// The provider's states of a subscription that charges, or may charge again.
const STANDING_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'paused',
];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly checkoutInFlight = new Map<
    string,
    Promise<Stripe.Checkout.Session>
  >();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(PaymentEventsService)
    private readonly paymentEvents: PaymentEventsService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return (
      this.configService?.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    );
  }

  // Map Stripe status to our SubscriptionStatus enum.
  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const status = stripeStatus.toLowerCase();
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      // A renewal that failed, which the provider is still trying: the plan
      // keeps what it gives meanwhile (ENTITLED_STATUSES).
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      // The provider has stopped trying: the invoice stays open, and nothing
      // is given until it is paid.
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      case 'incomplete_expired':
        return SubscriptionStatus.EXPIRED;
      case 'canceled':
        return SubscriptionStatus.CANCELLED;
      default:
        // A state not known here (paused, or a new one) gives nothing.
        return SubscriptionStatus.UNPAID;
    }
  }

  // The record of money a person paid, refunds included, or of every
  // transaction for staff. Amounts are in euros, not cents.
  async getLedgerCsv(userId?: string): Promise<string> {
    const transactions = await this.prisma.transaction.findMany({
      where: userId ? { senderId: userId } : undefined,
      orderBy: { createdAt: 'desc' },
      ...(userId
        ? {}
        : {
            include: {
              sender: { select: { email: true } },
            },
          }),
    });

    const header = userId
      ? 'ID,Date,Type,Direction,Amount,VAT,Refunded,Currency,Status,Description\n'
      : 'ID,Date,Type,Amount,VAT,Refunded,Currency,Status,Sender,Description\n';
    const rows = transactions
      .map((tx) => {
        const parties = tx as typeof tx & {
          sender?: { email: string } | null;
        };
        const common = [tx.id, tx.createdAt.toISOString(), tx.type];
        // The amount is what was paid; the VAT is the part of it that is VAT,
        // and refunded what the buyer got back of it.
        const money = [
          centsToEuros(tx.amount),
          centsToEuros(tx.vatCents),
          centsToEuros(tx.refundedCents),
          tx.currency,
          tx.status,
        ];
        const cells = userId
          ? [
              ...common,
              // Every row of a person's own record is one they paid, or the
              // refund of one (a negative amount).
              tx.amount < 0 ? 'REFUND' : 'SENT',
              ...money,
              csvText(tx.description),
            ]
          : [
              ...common,
              ...money,
              csvText(parties.sender?.email || 'SYSTEM'),
              csvText(tx.description),
            ];
        return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',');
      })
      .join('\n');

    return header + rows;
  }

  async findAllPlans() {
    return this.prisma.platformPlan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });
  }

  async createCheckout(
    userId: string,
    planId: string,
    billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
    profileId?: string,
  ): Promise<Stripe.Checkout.Session | { url: string }> {
    await assertRealMoneyAllowed(this.prisma, userId);
    await assertAdultPayer(this.prisma, userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { platformSubscriptions: { include: { plan: true } } },
    });

    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    // A plan belongs to one Profile: the one in use, which must be one of
    // the person's.
    const profile = profileId
      ? await this.prisma.profile.findFirst({
          where: { id: profileId, userId },
          select: { id: true, accountType: true },
        })
      : null;
    if (!profile) {
      throw AppException.NotFound(
        ErrorCode.PROFILE_NOT_FOUND,
        'Profile not found',
      );
    }

    const plan = await this.prisma.platformPlan.findFirst({
      where: {
        // A plan taken off sale cannot be bought, whoever names its id.
        isActive: true,
        OR: [{ id: planId }, { stripeProductId: planId }],
      },
    });

    if (!plan)
      throw AppException.NotFound(ErrorCode.PLAN_NOT_FOUND, 'Plan not found');

    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];
    // A plan may be for one type of Profile only, as the catalog says;
    // Verified and Premium are for any.
    const requiredType = plan.forAccountType;
    if (requiredType && profile.accountType !== requiredType) {
      throw AppException.BadRequest(
        ErrorCode.PLAN_NOT_FOR_PROFILE_TYPE,
        `This plan is for ${requiredType.toLowerCase()} profiles.`,
        { requiredAccountType: requiredType },
      );
    }

    // One active plan and one active add-on per Profile; the person's other
    // Profiles do not count.
    const activeSubs = user.platformSubscriptions.filter(
      (s) => s.profileId === profile.id && activeStatuses.includes(s.status),
    );
    // What still gives the Studio's Pro features: a renewal being tried again
    // included (ENTITLED_STATUSES).
    const givingSubs = user.platformSubscriptions.filter(
      (s) => s.profileId === profile.id && isEntitled(s.status),
    );
    // A payment due, being tried again or no longer: paid in the billing
    // portal, never replaced by a new purchase.
    const owing = (s: { status: SubscriptionStatus }) =>
      s.status === SubscriptionStatus.PAST_DUE ||
      s.status === SubscriptionStatus.UNPAID;

    if (activeSubs.some((s) => s.planId === plan.id)) {
      throw AppException.BadRequest(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'You already have an active subscription to this plan. Manage it in the billing portal.',
      );
    }

    const buyingAddOn = plan.addOn;
    // A plan with the badge needs the identity verified; the add-on not.
    await assertIdentityForBadge(this.prisma, userId, plan.features);
    if (buyingAddOn) {
      // The Studio's Pro features already come with some plans: they are
      // not paid for twice.
      if (
        givingSubs.some(
          (s) => !s.plan.addOn && s.plan.features.includes('studio_pro'),
        )
      ) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'This profile already has Edits Studio Pro with its plan.',
        );
      }
      // An add-on whose renewal failed is paid in the billing portal, not
      // bought again: two add-ons are never charged.
      const overdue = user.platformSubscriptions.some(
        (s) => s.profileId === profile.id && owing(s) && s.plan.addOn,
      );
      if (overdue) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'Edits Studio Pro has a payment due. Pay it in the billing portal.',
        );
      }
    } else {
      // A plan whose renewal failed is paid in the billing portal, not
      // replaced by another: two plans are never charged.
      const overdue = user.platformSubscriptions.some(
        (s) => s.profileId === profile.id && owing(s) && !s.plan.addOn,
      );
      if (overdue) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'This profile has a plan with a payment due. Pay it in the billing portal.',
        );
      }
      if (activeSubs.some((s) => !s.plan.addOn)) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'This profile already has an active platform plan. Cancel or change it via the billing portal before starting another.',
        );
      }
      // A plan that includes the Studio's Pro features is bought once the
      // add-on is cancelled, so the two are never charged together.
      if (
        plan.features.includes('studio_pro') &&
        givingSubs.some((s) => s.plan.addOn && !s.cancelAtPeriodEnd)
      ) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'This plan includes Edits Studio Pro. Cancel Edits Studio Pro before choosing it.',
        );
      }
    }

    const stripePriceId =
      billingCycle === 'YEARLY' ? plan.yearlyStripePriceId : plan.stripePriceId;

    if (!stripePriceId) {
      throw new Error(
        `Billing cycle ${billingCycle} is not available for this plan`,
      );
    }

    const intentKey = `${userId}:${profile.id}:${plan.id}:${billingCycle}`;
    const inFlight = this.checkoutInFlight.get(intentKey);
    if (inFlight) {
      return inFlight;
    }

    const checkoutPromise = (async () => {
      try {
        // Paused payments are refused before a customer is made in Stripe.
        await this.stripeService.assertPaymentsEnabled();
        const customerId = await this.ensureStripeCustomer(user);

        const session = await this.stripeService.createCheckoutSession(
          {
            customer: customerId,
            line_items: [{ price: stripePriceId, quantity: 1 }],
            mode: 'subscription',
            // Plan prices include VAT: the provider works out the VAT inside
            // the price for where the buyer is, from the billing address it
            // asks for, and saves that address on the customer for the
            // renewals.
            automatic_tax: { enabled: true },
            billing_address_collection: 'required',
            customer_update: { address: 'auto', name: 'auto' },
            success_url: `${this.frontendUrl}/accounts/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${this.frontendUrl}/accounts/billing?success=false`,
            metadata: {
              userId,
              planId: plan.id,
              billingCycle,
              profileId: profile.id,
              [CHECKOUT_ADD_ON_METADATA_KEY]: String(buyingAddOn),
              ...planStartConsentMetadata(),
            },
          },
          {
            // A new prefix whenever the parameters change (here the
            // consent wording, by its version): a key reused with other
            // parameters is refused. The minute keeps a retry of the same
            // request on the same session, and a purchase made again later
            // (after a withdrawal) on a new one.
            idempotencyKey: `checkout_sub_tax_${PLAN_START_CONSENT_VERSION}_${intentKey}:${Math.floor(Date.now() / 60_000)}`,
          },
        );
        // One payment page open per Profile for a plan (and one for the
        // add-on): the newest. An older one left in another tab can no
        // longer be paid, so two plans are not bought by mistake.
        await this.expireOtherOpenCheckouts(
          customerId,
          session,
          profile.id,
          buyingAddOn,
        );
        return session;
      } catch (err) {
        this.logger.error(
          `Stripe checkout session creation failed for ${intentKey} (${classifyStripeError(err)}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      } finally {
        this.checkoutInFlight.delete(intentKey);
      }
    })();

    this.checkoutInFlight.set(intentKey, checkoutPromise);
    return checkoutPromise;
  }

  // Only pages opened before the kept one are expired, so two pages opened
  // at once never expire each other. A page opened before the add-on mark
  // existed is told apart by its plan.
  private async expireOtherOpenCheckouts(
    customerId: string,
    kept: Pick<Stripe.Checkout.Session, 'id' | 'created'>,
    profileId: string,
    addOn: boolean,
  ) {
    try {
      const open =
        await this.stripeService.listOpenCheckoutSessions(customerId);
      const addOnPlanIds = new Set(
        (
          await this.prisma.platformPlan.findMany({
            where: { addOn: true },
            select: { id: true },
          })
        ).map((plan) => plan.id),
      );
      const isAddOn = (metadata: Stripe.Metadata | null | undefined) =>
        metadata?.[CHECKOUT_ADD_ON_METADATA_KEY] !== undefined
          ? metadata[CHECKOUT_ADD_ON_METADATA_KEY] === 'true'
          : addOnPlanIds.has(metadata?.planId ?? '');
      for (const other of open) {
        if (
          other.id !== kept.id &&
          other.created < kept.created &&
          other.mode === 'subscription' &&
          other.metadata?.profileId === profileId &&
          isAddOn(other.metadata) === addOn
        ) {
          await this.stripeService.expireCheckoutSession(other.id);
        }
      }
    } catch (err) {
      // The page just opened stays usable; a second plan paid from an older
      // page is still refunded when it arrives (refundDuplicatePlan).
      this.logger.warn(
        `Could not expire the older payment pages of profile ${profileId} (${classifyStripeError(err)})`,
      );
    }
  }

  /**
   * Ensures the user has a canonical Stripe customer ID idempotently and concurrency-safely.
   * Uses Stripe idempotency keys to guarantee only one customer is ever created in Stripe for a user.
   * Uses atomic database updates to resolve any race conditions locally.
   */
  async ensureStripeCustomer(user: {
    id: string;
    email: string;
    stripeCustomerId?: string | null;
  }): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Check database to ensure fresh state under concurrency
    const freshUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, stripeCustomerId: true },
    });
    if (freshUser?.stripeCustomerId) {
      return freshUser.stripeCustomerId;
    }

    // Idempotent customer creation in Stripe keyed by userId
    const customer = await this.stripeService.createCustomer(
      freshUser?.email || user.email,
      undefined,
      { idempotencyKey: `stripe_cust_${user.id}` },
    );

    if (!customer?.id) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CUSTOMER_MISSING,
        'Stripe customer creation failed',
      );
    }

    // Atomic update only if stripeCustomerId is still null
    const updateResult = await this.prisma.user.updateMany({
      where: { id: user.id, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });

    if (updateResult.count === 0) {
      // Another concurrent process won the local update race; read canonical value
      const canonicalUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { stripeCustomerId: true },
      });
      if (canonicalUser?.stripeCustomerId) {
        return canonicalUser.stripeCustomerId;
      }
    }

    return customer.id;
  }

  // The plan of the Profile in use and its add-on (Edits Studio Pro), and
  // which other Profiles of the person have a plan: the person pays for all
  // of them.
  async getBillingStatus(userId: string, profileId: string) {
    const [subscription, addOn] = await Promise.all([
      this.subscriptionInUse(userId, profileId, false),
      this.subscriptionInUse(userId, profileId, true),
    ]);
    // A plan whose renewal is being tried again still runs.
    const running = (sub: typeof subscription) =>
      !!sub && isEntitled(sub.status);

    return {
      hasActiveSubscription: running(subscription),
      subscription: subscription
        ? await this.describeSubscription(subscription)
        : null,
      studioPro: {
        // Whether the Profile's plan already gives the Studio's Pro
        // features; the add-on is then not bought.
        includedInPlan:
          running(subscription) &&
          subscription!.plan.features.includes('studio_pro'),
        subscription: addOn ? await this.describeSubscription(addOn) : null,
      },
      otherProfiles: await this.plansOfOtherProfiles(userId, profileId),
    };
  }

  // The plan (or add-on) of the Profile in use that is still running or
  // waiting on a failed renewal.
  private subscriptionInUse(userId: string, profileId: string, addOn: boolean) {
    return this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        // Without a Profile the session has no plan: never another one's.
        profileId: profileId || '__no_profile__',
        addOn,
        // A plan left unpaid is still the person's: shown, so it is paid
        // or cancelled, never bought again beside it.
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.UNPAID,
          ],
        },
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            yearlyPriceCents: true,
            yearlyStripePriceId: true,
            currency: true,
            features: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async describeSubscription(
    subscription: NonNullable<
      Awaited<ReturnType<PaymentsService['subscriptionInUse']>>
    >,
  ) {
    return {
      id: subscription.id,
      planId: subscription.planId,
      planName: subscription.plan.name,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      billingInterval: subscription.billingInterval,
      // What is charged each period: the yearly price for a yearly plan.
      priceCents:
        subscription.periodPriceCents ??
        (subscription.billingInterval === 'year'
          ? (subscription.plan.yearlyPriceCents ?? subscription.plan.priceCents)
          : subscription.plan.priceCents),
      // The yearly price a monthly plan can move to now (BD-016), or null
      // when it cannot: an add-on, a plan with no yearly price on sale, or
      // one that is not running, is cancelled or is withdrawn.
      yearlyPriceCents: this.canSwitchToYearly(subscription)
        ? subscription.plan.yearlyPriceCents
        : null,
      currency: subscription.plan.currency,
      // Until when the payer can withdraw from it (14 days from the purchase
      // at the provider, decided as the server decides), while it runs; null
      // once that has passed or while the purchase cannot be known.
      withdrawableUntil: await this.withdrawableUntil(subscription),
    };
  }

  private async withdrawableUntil(subscription: {
    id: string;
    stripeSubscriptionId: string;
    createdAt: Date;
    providerStartedAt: Date | null;
    yearlyStartedAt: Date | null;
    withdrawnAt: Date | null;
    status: SubscriptionStatus;
  }): Promise<Date | null> {
    const running: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
      SubscriptionStatus.PAST_DUE,
    ];
    if (!running.includes(subscription.status) || subscription.withdrawnAt) {
      return null;
    }
    const now = Date.now();
    // A plan moved to the yearly price: its 14 days count from the move.
    if (subscription.yearlyStartedAt) {
      return this.withdrawalOpen(subscription.yearlyStartedAt, now)
        ? withdrawalDeadline(subscription.yearlyStartedAt)
        : null;
    }
    // The row is written after the purchase: once 14 days have passed since
    // it was written, they have passed since the purchase too, and the
    // provider is not asked.
    if (!this.withdrawalOpen(subscription.createdAt, now)) return null;
    let startedAt = subscription.providerStartedAt;
    if (!startedAt) {
      try {
        startedAt = await this.keepProviderStart(subscription);
      } catch (err) {
        // Not offered while the purchase cannot be known: the server would
        // need it too. The next look asks again.
        this.logger.warn(
          `Could not read when subscription ${subscription.id} started at the provider`,
          err,
        );
        return null;
      }
    }
    return this.withdrawalOpen(startedAt, now)
      ? withdrawalDeadline(startedAt)
      : null;
  }

  // Reads when a subscription started at the provider (the purchase) and
  // keeps it on its row, for a row written before it was kept.
  private async keepProviderStart(subscription: {
    id: string;
    stripeSubscriptionId: string;
  }): Promise<Date> {
    const provider = await this.stripeService.getSubscription(
      subscription.stripeSubscriptionId,
    );
    const startedAt = new Date(provider.start_date * 1000);
    await this.prisma.platformSubscription.updateMany({
      where: { id: subscription.id, providerStartedAt: null },
      data: { providerStartedAt: startedAt },
    });
    return startedAt;
  }

  // Cancels the plan of the Profile in use (or its add-on) at the end of
  // the period paid: its features stay until then and nothing more is
  // charged. Only the person who pays it can cancel it. Cancelling again
  // changes nothing.
  async cancelPlan(userId: string, profileId: string, addOn = false) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        profileId: profileId || '__no_profile__',
        addOn,
        // One left unpaid can be cancelled too.
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.UNPAID,
          ],
        },
      },
      include: {
        plan: { select: { name: true } },
        profile: { select: { username: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!subscription) {
      throw AppException.NotFound(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'This profile has no plan to cancel',
      );
    }

    if (!subscription.cancelAtPeriodEnd) {
      await this.stripeService
        .cancelSubscription(subscription.stripeSubscriptionId, true)
        .catch((err: unknown) =>
          this.refusedByProvider(subscription.stripeSubscriptionId, err),
        );
      await this.prisma.platformSubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });

      // Telling the payer is best effort: the cancellation already stands.
      try {
        const payer = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        if (payer?.email) {
          await this.emailService.sendPlanCancelledEmail(
            payer.email,
            subscription.plan.name,
            subscription.profile?.username ?? '',
            subscription.currentPeriodEnd,
          );
        }
      } catch (err) {
        this.logger.error('Failed to send the plan cancelled email', err);
      }
    }

    return this.getBillingStatus(userId, profileId);
  }

  // Withdraws from the contract of the plan of the Profile in use (or its
  // add-on) within 14 days of buying it (PD-023, TRLGDCU Art. 108): the
  // plan ends now, its benefits stop now, and the part of what was paid for
  // the period not used is refunded to the card. Only the person who pays
  // it can. After the 14 days it is refused; cancelling at the end of the
  // period still works.
  //
  // Public contract additions decided by the owner under PD-023: the
  // endpoints POST plan/withdraw and plan/studio-pro/withdraw, the
  // `withdrawableUntil` field of the billing status and the error code
  // WITHDRAWAL_PERIOD_ENDED.
  //
  // Steps, all in the one request that asks for it:
  // 1. Checked, with nothing changed: the 14 days, counted from the purchase
  //    at the provider, and the refund owed for the unused part, worked out
  //    once from the paid invoice.
  // 2. Settled at the provider first (settleWithdrawal): the plan ended, its
  //    open invoices voided, the unused part refunded to the card. Each step
  //    can be repeated (an ended plan counts as ended, and the refund is
  //    looked for by its metadata before one is made), so when one fails
  //    nothing is marked here, the person is told to try again, and trying
  //    again finishes it without refunding twice.
  // 3. Marked, in one conditional write: withdrawn, CANCELLED, what was
  //    refunded and what the team owes, so the benefits stop. A second
  //    request at the same time finds the row marked and tells no one.
  // 4. The team told what it owes; the payer emailed.
  // The request acts on the running plan only: an older withdrawal not
  // finished yet is the reconcile job's, never taken for this one.
  async withdrawPlan(userId: string, profileId: string, addOn = false) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        profileId: profileId || '__no_profile__',
        addOn,
        withdrawnAt: null,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!subscription) {
      throw AppException.NotFound(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'This profile has no plan to withdraw from',
      );
    }

    const owed = await this.withdrawalRefundOwed(subscription);
    const refund = await this.settleWithdrawal(subscription, owed);

    // What the card could not take is the team's to pay back.
    const refundedCents = refund?.amount ?? 0;
    const owedByStaffCents =
      owed.owedByStaffCents + Math.max(0, owed.refundCents - refundedCents);
    const now = new Date();
    const { count } = await this.prisma.platformSubscription.updateMany({
      where: { id: subscription.id, withdrawnAt: null },
      data: {
        withdrawnAt: now,
        withdrawalRefundCents: refundedCents,
        withdrawalRefundId: refund?.id ?? null,
        withdrawalOwedByStaffCents: owedByStaffCents,
        withdrawalFinishedAt: now,
        providerStartedAt: owed.startedAt,
        status: SubscriptionStatus.CANCELLED,
      },
    });
    // Marked by another request at the same time: that one tells everyone.
    if (count === 0) return this.getBillingStatus(userId, profileId);

    if (subscription.userId)
      await this.syncBenefitsOfWithdrawn(subscription.userId);
    if (owedByStaffCents > 0) {
      const message = `Plan withdrawal of subscription ${subscription.id}: ${owedByStaffCents} cents are owed by staff`;
      this.logger.warn(message);
      Sentry.captureMessage(message, {
        level: 'warning',
        tags: { area: 'plan-withdrawal' },
        fingerprint: ['plan-withdrawal-owed', subscription.id],
        extra: {
          platformSubscriptionId: subscription.id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          paymentIntentId: owed.paymentIntentId,
          refundId: refund?.id ?? null,
          owedByStaffCents,
        },
      });
    }
    await this.emailWithdrawal(subscription, refund, owedByStaffCents);
    return this.getBillingStatus(userId, profileId);
  }

  // Ends the plan at the provider, voids its open invoices and refunds the
  // unused part to the card. When a step fails nothing is marked: it is
  // reported, and the person is told to try again, which finishes it.
  private async settleWithdrawal(
    subscription: { id: string; stripeSubscriptionId: string },
    owed: { refundCents: number; paymentIntentId: string | null },
  ): Promise<Stripe.Refund | null> {
    const stripeSubscriptionId = subscription.stripeSubscriptionId;
    try {
      await this.endAtProvider(stripeSubscriptionId);
      await this.stripeService.voidOpenInvoices(stripeSubscriptionId);
      if (owed.refundCents > 0 && owed.paymentIntentId) {
        return await this.stripeService.refundSubscriptionPayment({
          paymentIntentId: owed.paymentIntentId,
          amountInCents: owed.refundCents,
          idempotencyKey: `plan-withdrawal-${stripeSubscriptionId}`,
          metadata: {
            reason: 'withdrawal',
            platformSubscriptionId: subscription.id,
          },
        });
      }
      return null;
    } catch (err) {
      this.logger.error(
        `Withdrawal of subscription ${subscription.id} could not be settled at the provider (${classifyStripeError(err)}); the person can try again`,
      );
      Sentry.captureException(err, {
        tags: { area: 'plan-withdrawal' },
        fingerprint: ['plan-withdrawal-unsettled', subscription.id],
        extra: {
          platformSubscriptionId: subscription.id,
          stripeSubscriptionId,
          paymentIntentId: owed.paymentIntentId,
          refundCents: owed.refundCents,
        },
      });
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
        'The withdrawal could not be completed right now. Try again in a moment.',
      );
    }
  }

  // Tells the payer the plan was withdrawn and what was refunded. Best
  // effort: the withdrawal already stands.
  private async emailWithdrawal(
    subscription: {
      userId: string | null;
      planId: string;
      profileId: string | null;
    },
    refund: Stripe.Refund | null,
    owedByStaffCents: number,
  ): Promise<void> {
    try {
      const [payer, plan, profile] = await Promise.all([
        subscription.userId
          ? this.prisma.user.findUnique({
              where: { id: subscription.userId },
              select: { email: true },
            })
          : null,
        this.prisma.platformPlan.findUnique({
          where: { id: subscription.planId },
          select: { name: true, currency: true },
        }),
        subscription.profileId
          ? this.prisma.profile.findUnique({
              where: { id: subscription.profileId },
              select: { username: true },
            })
          : null,
      ]);
      if (payer?.email && plan) {
        await this.emailService.sendPlanWithdrawnEmail(
          payer.email,
          plan.name,
          profile?.username ?? '',
          refund?.amount ?? 0,
          refund?.currency ?? plan.currency,
          owedByStaffCents,
        );
      }
    } catch (err) {
      this.logger.error('Failed to send the plan withdrawn email', err);
    }
  }

  // Ends a subscription at the provider now. One the provider already holds
  // as ended counts as done; any other refusal is thrown.
  private async endAtProvider(
    stripeSubscriptionId: string,
  ): Promise<StripeSubscriptionState> {
    try {
      return (await this.stripeService.endSubscriptionNow(
        stripeSubscriptionId,
      )) as unknown as StripeSubscriptionState;
    } catch (err) {
      if ((err as { type?: string })?.type !== 'StripeInvalidRequestError') {
        throw err;
      }
      const current = (await this.stripeService.getSubscription(
        stripeSubscriptionId,
      )) as unknown as StripeSubscriptionState;
      if (!ENDED_AT_PROVIDER.includes(current?.status)) throw err;
      return current;
    }
  }

  // Whether a plan bought at `startedAt` can still be withdrawn from at
  // `now`: the last moment of the 14 days included. Used for what the
  // person is shown and for what the server allows.
  private withdrawalOpen(startedAt: Date, now: number): boolean {
    return now <= withdrawalDeadline(startedAt).getTime();
  }

  // What a withdrawal from now owes: the refund for the unused part, in
  // cents, the invoice and payment it is refunded from, and when the plan
  // was bought at the provider. Refuses after the 14 days, and a plan paid
  // from the customer's balance or a credit (staff refund those). Nothing is
  // changed here.
  private async withdrawalRefundOwed(subscription: {
    id: string;
    stripeSubscriptionId: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    providerStartedAt: Date | null;
    yearlyStartedAt: Date | null;
    billingInterval: string;
  }): Promise<{
    refundCents: number;
    owedByStaffCents: number;
    invoiceId: string | null;
    paymentIntentId: string | null;
    startedAt: Date;
  }> {
    const stripeSubscriptionId = subscription.stripeSubscriptionId;
    // From the purchase at the provider: the row is written when its notice
    // is processed, which can be hours later. Read from the provider for a
    // row written before the start was kept.
    const startedAt =
      subscription.providerStartedAt ??
      (await this.keepProviderStart(subscription).catch((err: unknown) =>
        this.refusedByProvider(stripeSubscriptionId, err),
      ));
    // The 14 days count from the purchase, or from the move to the yearly
    // price, a new contract, for a plan moved to it.
    let windowFrom = subscription.yearlyStartedAt ?? startedAt;
    const now = Date.now();
    // A move just paid whose notice is not processed yet: the row is still
    // monthly. Before refusing, the provider is read and the row brought in
    // line, so the year just paid can be withdrawn from. When the provider
    // cannot answer, the row as it is decides.
    if (
      !this.withdrawalOpen(windowFrom, now) &&
      subscription.billingInterval === 'month'
    ) {
      const current = await this.currentSubscription({
        id: stripeSubscriptionId,
      } as StripeSubscriptionState).catch(() => null);
      if (current && subscriptionInterval(current) === 'year') {
        await this.applyStripeSubscription(current);
        const moved = await this.prisma.platformSubscription.findFirst({
          where: { id: subscription.id },
          select: { yearlyStartedAt: true },
        });
        windowFrom = moved?.yearlyStartedAt ?? windowFrom;
      }
    }
    if (!this.withdrawalOpen(windowFrom, now)) {
      const deadline = withdrawalDeadline(windowFrom);
      throw AppException.BadRequest(
        ErrorCode.WITHDRAWAL_PERIOD_ENDED,
        `The 14 days to withdraw from this plan ended on ${deadline.toISOString().slice(0, 10)}. It can still be cancelled at the end of its period.`,
        { deadline: deadline.toISOString() },
      );
    }

    const invoice =
      await this.stripeService.latestPaidInvoice(stripeSubscriptionId);
    // Nothing paid (a free invoice, or none yet): nothing to refund.
    if (!invoice || invoice.totalCents <= 0) {
      return {
        refundCents: 0,
        owedByStaffCents: 0,
        invoiceId: invoice?.id ?? null,
        paymentIntentId: null,
        startedAt,
      };
    }
    // What the card paid is refunded to it; what was paid from the
    // customer's balance or a credit is owed by staff (owner decision,
    // 2026-11-22): the plan is withdrawn like any other either way.
    const cardCents = invoice.paymentIntentId ? invoice.paidCents : 0;
    const balanceCents = Math.max(0, invoice.totalCents - cardCents);
    // The period paid for, as the invoice says; the row's when the invoice
    // names none.
    let start = invoice.periodStart.getTime();
    let end = invoice.periodEnd.getTime();
    if (end <= start) {
      start = subscription.currentPeriodStart.getTime();
      end = subscription.currentPeriodEnd.getTime();
    }
    // Each part rounded down on its own: together never more than the
    // unused share of what the period cost.
    const cardUnused = unusedPartCents(cardCents, start, end, now);
    const balanceUnused = unusedPartCents(balanceCents, start, end, now);
    // An invoice of a move to the yearly price had the rest of the month
    // taken off: that credit paid for part of the year too, with money paid
    // before. Its unused share is owed as well, refunded to the card of this
    // payment as far as it goes and the rest by staff, so the payer gets
    // back the unused part of the whole year (Terms section 6).
    const creditUnused = unusedPartCents(
      invoice.creditCents ?? 0,
      start,
      end,
      now,
    );
    const creditToCard = Math.min(creditUnused, cardCents - cardUnused);
    return {
      refundCents: cardUnused + creditToCard,
      owedByStaffCents: balanceUnused + creditUnused - creditToCard,
      invoiceId: invoice.id,
      paymentIntentId: cardCents > 0 ? invoice.paymentIntentId : null,
      startedAt,
    };
  }

  // Syncs the benefits of the payer of a withdrawn plan. A failure is
  // logged and never holds back the rest: every attempt syncs them again.
  private async syncBenefitsOfWithdrawn(userId: string) {
    try {
      await this.usersService.syncUserTier(userId);
    } catch (err) {
      this.logger.error('Failed to stop the benefits of a withdrawn plan', err);
    }
  }

  // One attempt to finish a marked withdrawal. When it does not finish (a
  // step failed, or the refund is still pending) the next attempt is put
  // off, longer each time, and a withdrawal that keeps failing is reported
  // to the error tracker. Whether it finished.
  private async attemptWithdrawal(
    id: string,
    attemptsBefore: number,
    withdrawnAt: Date,
  ): Promise<boolean> {
    let failure: unknown = null;
    try {
      if ((await this.finishWithdrawal(id)) === 'finished') return true;
    } catch (err) {
      failure = err;
      this.logger.error(
        `Withdrawal of subscription ${id} could not be finished yet; it is tried again later (${classifyStripeError(err)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const attempts = attemptsBefore + 1;
    await this.prisma.platformSubscription
      .updateMany({
        where: { id, withdrawalFinishedAt: null },
        data: {
          withdrawalAttempts: attempts,
          withdrawalNextAttemptAt: new Date(
            Date.now() + withdrawalRetryDelayMs(attempts),
          ),
        },
      })
      .catch((err: unknown) =>
        this.logger.error(
          'Failed to schedule the next withdrawal attempt',
          err,
        ),
      );
    // Someone must look at a withdrawal that does not finish: one failing
    // again and again, or one waiting on a refund that stays pending. Once
    // per attempt, and from the fifth one on attempts are over an hour
    // apart.
    if (
      attempts >= WITHDRAWAL_REPORT_FROM_ATTEMPT ||
      Date.now() - withdrawnAt.getTime() > WITHDRAWAL_REPORT_AFTER_MS
    ) {
      const context = {
        tags: { area: 'plan-withdrawal' },
        extra: { platformSubscriptionId: id, attempts },
      };
      if (failure) {
        Sentry.captureException(failure, context);
      } else {
        Sentry.captureMessage(
          `Withdrawal of subscription ${id} is still waiting for its refund`,
          { level: 'warning', ...context },
        );
      }
    }
    return false;
  }

  // Finishes a withdrawal marked before withdrawals were made in one request
  // (completeWithdrawal): only those carry a next attempt, so only those are
  // finished here, by the reconcile job. Every step can be repeated.
  // 'waiting' while its refund is pending at the provider. Removed with the
  // columns it uses once none is left.
  private async finishWithdrawal(id: string): Promise<'finished' | 'waiting'> {
    const row = await this.prisma.platformSubscription.findUnique({
      where: { id },
      include: {
        plan: { select: { name: true, currency: true } },
        profile: { select: { username: true } },
      },
    });
    if (!row?.withdrawnAt || row.withdrawalFinishedAt) return 'finished';
    const stripeSubscriptionId = row.stripeSubscriptionId;

    // The benefits follow the row, which is CANCELLED: synced again on every
    // attempt in case the sync failed when it was marked.
    if (row.userId) await this.syncBenefitsOfWithdrawn(row.userId);

    // Ended at the provider; one that has already ended (an earlier try)
    // counts as done. Otherwise nothing more is done this round (no
    // refund); the row stays marked and the reconcile job tries again.
    const ended = await this.endAtProvider(stripeSubscriptionId);
    // A renewal that failed leaves an open invoice the provider would keep
    // trying to collect.
    await this.stripeService.voidOpenInvoices(stripeSubscriptionId);

    const owed = row.withdrawalRefundCents ?? 0;
    let refund: Stripe.Refund | null = null;
    if (owed > 0) {
      if (!row.withdrawalPaymentIntentId) {
        throw new Error('The withdrawal names no payment to refund');
      }
      try {
        refund = await this.stripeService.refundSubscriptionPayment({
          paymentIntentId: row.withdrawalPaymentIntentId,
          amountInCents: owed,
          idempotencyKey:
            row.withdrawalRefundKey ??
            `plan-withdrawal-${stripeSubscriptionId}`,
          metadata: { reason: 'withdrawal', platformSubscriptionId: row.id },
        });
      } catch (err) {
        // The provider answered with an error, which it keeps under the key:
        // the next attempt takes a new key (it first looks for a refund of
        // this withdrawal, so none is made twice). An outcome that is not
        // known keeps the key.
        if (isProviderErrorResponse(err)) {
          await this.prisma.platformSubscription.updateMany({
            where: { id: row.id },
            data: {
              withdrawalRefundKey: `plan-withdrawal-${stripeSubscriptionId}-${Date.now()}`,
            },
          });
        }
        throw err;
      }
      // The provider refunds no more than is left of the payment: what it
      // could not give back is owed by staff, kept and reported once (the
      // write changes the row only while it still owes the amount asked).
      const refundedCents = refund?.amount ?? 0;
      const shortCents = Math.max(0, owed - refundedCents);
      const { count: settled } =
        await this.prisma.platformSubscription.updateMany({
          where: { id: row.id, withdrawalRefundCents: owed },
          data: {
            ...(refund && { withdrawalRefundId: refund.id }),
            ...(shortCents > 0 && {
              withdrawalRefundCents: refundedCents,
              withdrawalOwedByStaffCents: { increment: shortCents },
            }),
          },
        });
      if (shortCents > 0 && settled > 0) {
        const message = `Plan withdrawal of subscription ${row.id}: ${shortCents} cents could not be refunded to the payment and are owed by staff`;
        this.logger.warn(message);
        Sentry.captureMessage(message, {
          level: 'warning',
          tags: { area: 'plan-withdrawal' },
          extra: {
            platformSubscriptionId: row.id,
            owedByStaffCents: shortCents,
          },
        });
      }
    }

    // The provider's state on the row; a withdrawn row stays CANCELLED.
    await this.applyStripeSubscription(ended);

    // A refund pending at the bank may still fail: the withdrawal is
    // finished, and the payer told, once it has gone through.
    if (refund && refund.status !== 'succeeded') return 'waiting';

    const { count } = await this.prisma.platformSubscription.updateMany({
      where: { id: row.id, withdrawalFinishedAt: null },
      data: { withdrawalFinishedAt: new Date(), withdrawalNextAttemptAt: null },
    });
    // Finished by another request meanwhile: it told the payer.
    if (count === 0) return 'finished';

    // Telling the payer is best effort: the withdrawal already stands.
    try {
      const payer = row.userId
        ? await this.prisma.user.findUnique({
            where: { id: row.userId },
            select: { email: true },
          })
        : null;
      if (payer?.email) {
        await this.emailService.sendPlanWithdrawnEmail(
          payer.email,
          row.plan.name,
          row.profile?.username ?? '',
          refund?.amount ?? 0,
          refund?.currency ?? row.plan.currency,
          row.withdrawalOwedByStaffCents ?? 0,
        );
      }
    } catch (err) {
      this.logger.error('Failed to send the plan withdrawn email', err);
    }
    return 'finished';
  }

  // Finishes the withdrawals marked and not finished whose next attempt is
  // due, the longest waiting first: the end, the voiding or the refund
  // failed, or the refund was pending. One that keeps failing waits longer
  // each time, so it never holds back the others.
  async finishPendingWithdrawals(limit = 25): Promise<number> {
    const due = await this.prisma.platformSubscription.findMany({
      where: {
        withdrawnAt: { not: null },
        withdrawalFinishedAt: null,
        withdrawalNextAttemptAt: { lte: new Date() },
      },
      select: { id: true, withdrawalAttempts: true, withdrawnAt: true },
      take: limit,
      orderBy: { withdrawalNextAttemptAt: 'asc' },
    });
    let finished = 0;
    for (const { id, withdrawalAttempts, withdrawnAt } of due) {
      if (
        withdrawnAt &&
        (await this.attemptWithdrawal(id, withdrawalAttempts, withdrawnAt))
      ) {
        finished++;
      }
    }
    return finished;
  }

  // Takes back the cancellation of the plan of the Profile in use while it
  // is still in force: it renews on its date again and nothing is charged
  // now. Only the person who pays it can. Resuming a plan that is not
  // cancelled changes nothing; a plan whose period has ended, or whose
  // renewal failed, is not resumed (a new checkout is the way back).
  async resumePlan(userId: string, profileId: string, addOn = false) {
    const subscription = await this.prisma.platformSubscription.findFirst({
      where: {
        userId,
        profileId: profileId || '__no_profile__',
        addOn,
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
      include: {
        plan: { select: { name: true } },
        profile: { select: { username: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!subscription) {
      throw AppException.NotFound(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'This profile has no plan to resume',
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      if (subscription.currentPeriodEnd.getTime() <= Date.now()) {
        throw AppException.NotFound(
          ErrorCode.SUBSCRIPTION_NOT_FOUND,
          'This plan has ended and cannot be resumed',
        );
      }
      // Resuming means the plan is charged again on its date: whoever pays
      // must be an adult, as for a new plan.
      await assertAdultPayer(this.prisma, userId);
      // The add-on is not resumed beside a plan that already includes it.
      if (addOn && (await this.planIncludesStudioPro(profileId))) {
        throw AppException.Conflict(
          ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
          'This profile already has Edits Studio Pro with its plan.',
        );
      }
      await this.stripeService
        .resumeSubscription(subscription.stripeSubscriptionId)
        .catch((err: unknown) =>
          this.refusedByProvider(subscription.stripeSubscriptionId, err),
        );
      // Changed only while still cancelled, so two requests at once tell
      // the payer once.
      const { count } = await this.prisma.platformSubscription.updateMany({
        where: { id: subscription.id, cancelAtPeriodEnd: true },
        data: { cancelAtPeriodEnd: false },
      });

      // Telling the payer is best effort: the plan already continues.
      if (count > 0) {
        try {
          const payer = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          });
          if (payer?.email) {
            await this.emailService.sendPlanResumedEmail(
              payer.email,
              subscription.plan.name,
              subscription.profile?.username ?? '',
              subscription.currentPeriodEnd,
            );
          }
        } catch (err) {
          this.logger.error('Failed to send the plan resumed email', err);
        }
      }
    }

    return this.getBillingStatus(userId, profileId);
  }

  // Whether a plan can move from monthly to yearly now (BD-016): a running
  // monthly plan, not an add-on, not cancelled nor withdrawn, whose plan has
  // a yearly price on sale.
  private canSwitchToYearly(subscription: {
    status: SubscriptionStatus;
    addOn: boolean;
    billingInterval: string;
    cancelAtPeriodEnd: boolean;
    withdrawnAt: Date | null;
    plan: {
      yearlyPriceCents: number | null;
      yearlyStripePriceId: string | null;
    };
  }): boolean {
    return (
      subscription.status === SubscriptionStatus.ACTIVE &&
      !subscription.addOn &&
      subscription.billingInterval === 'month' &&
      !subscription.cancelAtPeriodEnd &&
      !subscription.withdrawnAt &&
      !!subscription.plan.yearlyStripePriceId &&
      (subscription.plan.yearlyPriceCents ?? 0) > 0
    );
  }

  // Moves the monthly plan of the Profile in use to its yearly price
  // (BD-016): what is left of the month paid is credited, the year starts
  // today and the difference is charged now. The change applies once that
  // charge is paid; when the card needs the payer (authentication, a
  // decline), the plan stays monthly and `paymentUrl` is the provider's page
  // to pay it, after which the change applies. The year is a new contract:
  // its 14 days to withdraw count from the move. Only the person who pays
  // it can.
  //
  // Public contract addition decided by the owner under BD-016: the
  // endpoint POST plan/yearly, and the billing status fields
  // `billingInterval` and `yearlyPriceCents`.
  async switchPlanToYearly(userId: string, profileId: string) {
    const subscription = await this.subscriptionInUse(userId, profileId, false);
    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      throw AppException.NotFound(
        ErrorCode.SUBSCRIPTION_NOT_FOUND,
        'This profile has no running plan to pay by the year',
      );
    }
    if (subscription.billingInterval === 'year') {
      throw AppException.Conflict(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'This plan is already paid by the year.',
      );
    }
    if (subscription.cancelAtPeriodEnd || subscription.withdrawnAt) {
      throw AppException.Conflict(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'Resume this plan before paying it by the year.',
      );
    }
    const yearlyPriceId = subscription.plan.yearlyStripePriceId;
    if (!this.canSwitchToYearly(subscription) || !yearlyPriceId) {
      throw AppException.BadRequest(
        ErrorCode.PRICE_NOT_FOUND,
        'This plan has no yearly price.',
      );
    }
    // A new charge: the same checks as a new plan.
    await assertRealMoneyAllowed(this.prisma, userId);
    await assertAdultPayer(this.prisma, userId);
    await this.stripeService.assertPaymentsEnabled();

    // One request at a time: the move is claimed on the row for two
    // minutes, so a second click or device is refused rather than charged.
    const claimedAt = new Date();
    const { count: claimed } =
      await this.prisma.platformSubscription.updateMany({
        where: {
          id: subscription.id,
          billingInterval: 'month',
          OR: [
            { yearlyMoveClaimedAt: null },
            {
              yearlyMoveClaimedAt: {
                lt: new Date(claimedAt.getTime() - YEARLY_MOVE_CLAIM_MS),
              },
            },
          ],
        },
        data: { yearlyMoveClaimedAt: claimedAt },
      });
    if (claimed === 0) {
      throw AppException.Conflict(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'This plan is already being moved to yearly.',
      );
    }

    const stripeSubscriptionId = subscription.stripeSubscriptionId;
    const current = (await this.stripeService
      .getSubscriptionWithInvoice(stripeSubscriptionId)
      .catch((err: unknown) =>
        this.refusedByProvider(stripeSubscriptionId, err),
      )) as unknown as SwitchedSubscription;
    const item = current.items?.data?.[0];
    if (!item?.id || typeof item.current_period_start !== 'number') {
      throw new Error(
        `Subscription ${stripeSubscriptionId} has no item to move to the yearly price`,
      );
    }
    // The provider already holds it yearly (a notice not processed yet):
    // the row is brought in line and nothing is charged again.
    if (subscriptionInterval(current) === 'year') {
      await this.applyStripeSubscription(current);
      return {
        ...(await this.getBillingStatus(userId, profileId)),
        pending: false,
        paymentUrl: null,
      };
    }
    // The provider has it cancelled or not running, though the row does not
    // say so yet: the row is brought in line and nothing is charged.
    if (current.status !== 'active' || current.cancel_at_period_end) {
      await this.applyStripeSubscription(current);
      throw AppException.Conflict(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
        'Resume this plan before paying it by the year.',
      );
    }
    // A move asked for earlier still waits for its charge: its page is
    // given again, and nothing new is charged.
    const waiting = this.pendingMovePage(current);
    if (waiting) {
      return {
        ...(await this.getBillingStatus(userId, profileId)),
        pending: true,
        paymentUrl: waiting,
      };
    }

    // The key names this claim: the library's own retries of this request
    // reuse it, and a later request (an earlier charge left unpaid and
    // expired) makes a new one.
    const updated = (await this.stripeService
      .switchSubscriptionPrice({
        subscriptionId: stripeSubscriptionId,
        itemId: item.id,
        priceId: yearlyPriceId,
        metadata: {
          ...planStartConsentMetadata(),
          [YEARLY_MOVE_METADATA_KEY]: 'true',
        },
        idempotencyKey: `plan_yearly_${PLAN_START_CONSENT_VERSION}_${stripeSubscriptionId}_${claimedAt.getTime()}`,
      })
      .catch(async (err: unknown) => {
        // A refusal of the change itself, for a plan still running at the
        // provider, is not "the plan has ended".
        if ((err as { type?: string })?.type === 'StripeInvalidRequestError') {
          const still = await this.stripeService
            .getSubscription(stripeSubscriptionId)
            .catch(() => null);
          if (still && !ENDED_AT_PROVIDER.includes(still.status)) {
            this.logger.error(
              `The provider refused to move subscription ${stripeSubscriptionId} to the yearly price: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            throw AppException.BadRequest(
              ErrorCode.PRICE_NOT_FOUND,
              'The yearly price could not be applied to this plan.',
            );
          }
        }
        return this.refusedByProvider(stripeSubscriptionId, err);
      })) as unknown as SwitchedSubscription;

    if (updated.pending_update) {
      return {
        ...(await this.getBillingStatus(userId, profileId)),
        pending: true,
        paymentUrl: this.pendingMovePage(updated),
      };
    }
    await this.applyStripeSubscription(updated);
    return {
      ...(await this.getBillingStatus(userId, profileId)),
      pending: false,
      paymentUrl: null,
    };
  }

  // The page to pay the charge a waiting move needs, while that charge can
  // still be paid; null when nothing waits or its invoice is gone.
  private pendingMovePage(subscription: SwitchedSubscription): string | null {
    if (!subscription.pending_update) return null;
    const invoice = subscription.latest_invoice;
    if (!invoice || typeof invoice !== 'object') return null;
    if (invoice.status !== 'open') return null;
    return invoice.hosted_invoice_url ?? null;
  }

  // A notice may arrive late or twice: one about a cancellation can come
  // after the plan was resumed. The subscription is read again from the
  // provider, so the row always takes its state as it is now; the notice's
  // own copy is used only when the provider cannot answer.
  private async currentSubscription(
    named: StripeSubscriptionState,
  ): Promise<StripeSubscriptionState> {
    try {
      return (await this.stripeService.getSubscription(
        named.id,
      )) as unknown as StripeSubscriptionState;
    } catch (err) {
      // Only a subscription the provider does not hold here falls back to
      // the notice's copy. Any other failure (network, rate limit) is
      // thrown, so the notice is tried again later rather than writing a
      // state that may be stale.
      if ((err as { type?: string })?.type !== 'StripeInvalidRequestError') {
        throw err;
      }
      this.logger.warn(
        `Could not read subscription ${named.id} again; using the notice's copy`,
        err,
      );
      return named;
    }
  }

  // Writes a subscription's state, as the provider holds it, on its row,
  // and the plan's benefits of the person with it. A row withdrawn from
  // stays CANCELLED, also while the provider still says it runs (a notice
  // read before the withdrawal ended it there): both writes commit together,
  // so the row is never seen running again.
  private async applyStripeSubscription(subscription: StripeSubscriptionState) {
    const period = subscriptionPeriod(subscription);
    await this.prisma.$transaction(async (tx) => {
      await this.keepYearlyMove(tx, subscription, period);
      // A copy read before a move to the yearly price, written after it,
      // never takes the row back to the month it left.
      await tx.platformSubscription.updateMany({
        where: {
          stripeSubscriptionId: subscription.id,
          OR: [
            { yearlyStartedAt: null },
            { yearlyStartedAt: { lte: period.start } },
          ],
        },
        data: {
          status: this.mapStripeStatus(subscription.status),
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          ...providerStart(subscription),
          ...providerInterval(subscription),
        },
      });
      await this.keepWithdrawnEnded(tx, subscription.id);
    });
    const platformSub = await this.prisma.platformSubscription.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true },
    });
    if (platformSub?.userId) {
      await this.usersService.syncUserTier(platformSub.userId);
    }
  }

  // A monthly plan moved to the yearly price in the app (BD-016) starts its
  // year, and its 14 days to withdraw, at the move: kept once, while the
  // row is still monthly, before the row takes the yearly interval. Only a
  // subscription the move marked counts, never one bought yearly.
  private async keepYearlyMove(
    tx: Pick<PrismaService, 'platformSubscription'>,
    subscription: SubscriptionWithItems & {
      id: string;
      metadata?: Record<string, string> | null;
    },
    period: { start: Date },
  ) {
    if (
      subscriptionInterval(subscription) !== 'year' ||
      subscription.metadata?.[YEARLY_MOVE_METADATA_KEY] !== 'true'
    ) {
      return;
    }
    await tx.platformSubscription.updateMany({
      where: {
        stripeSubscriptionId: subscription.id,
        billingInterval: 'month',
      },
      data: { yearlyStartedAt: period.start },
    });
  }

  // A row withdrawn from stays CANCELLED whatever a notice says of it.
  private keepWithdrawnEnded(
    tx: Pick<PrismaService, 'platformSubscription'>,
    stripeSubscriptionId: string,
  ) {
    return tx.platformSubscription.updateMany({
      where: {
        stripeSubscriptionId,
        withdrawnAt: { not: null },
        status: { not: SubscriptionStatus.CANCELLED },
      },
      data: { status: SubscriptionStatus.CANCELLED },
    });
  }

  // The provider refused to change a subscription the row says is running:
  // it has ended there. The row takes its state from the provider and the
  // person is told the plan is not there to change any more.
  private async refusedByProvider(
    stripeSubscriptionId: string,
    err: unknown,
  ): Promise<never> {
    if ((err as { type?: string })?.type !== 'StripeInvalidRequestError') {
      throw err;
    }
    // The row is brought in line when the provider can be read; the answer
    // is the same either way.
    const current = await this.currentSubscription({
      id: stripeSubscriptionId,
    } as StripeSubscriptionState).catch(() => null);
    if (current?.status) await this.applyStripeSubscription(current);
    throw AppException.NotFound(
      ErrorCode.SUBSCRIPTION_NOT_FOUND,
      'This plan has ended',
    );
  }

  // Whether the running plan (not an add-on) of a Profile gives the
  // Studio's Pro features.
  private async planIncludesStudioPro(profileId: string): Promise<boolean> {
    const count = await this.prisma.platformSubscription.count({
      where: {
        profileId: profileId || '__no_profile__',
        addOn: false,
        status: { in: [...ENTITLED_STATUSES] },
        plan: { features: { has: 'studio_pro' } },
      },
    });
    return count > 0;
  }

  // Two checkouts at once can end with the add-on and a plan that includes
  // it both running. The add-on then stops renewing: it ends with the
  // period already paid, so nothing is charged twice again and no paid
  // time is lost.
  private async stopAddOnBesidePlanWithStudioPro(profileId: string) {
    if (!(await this.planIncludesStudioPro(profileId))) return;
    const addOns = await this.prisma.platformSubscription.findMany({
      where: {
        profileId,
        addOn: true,
        cancelAtPeriodEnd: false,
        // An add-on still charged or still being tried again stops too.
        status: { in: [...ENTITLED_STATUSES] },
      },
      select: { id: true, stripeSubscriptionId: true },
    });
    for (const addOn of addOns) {
      try {
        await this.stripeService.cancelSubscription(
          addOn.stripeSubscriptionId,
          true,
        );
        await this.prisma.platformSubscription.update({
          where: { id: addOn.id },
          data: { cancelAtPeriodEnd: true },
        });
      } catch (err) {
        this.logger.error(
          `Failed to stop the add-on ${addOn.stripeSubscriptionId} beside a plan that includes it`,
          err,
        );
      }
    }
  }

  private async plansOfOtherProfiles(userId: string, profileId: string) {
    const others = await this.prisma.platformSubscription.findMany({
      where: {
        userId,
        // The plans, not the add-ons.
        addOn: false,
        profileId: { not: profileId || '__no_profile__' },
        status: { in: [...ENTITLED_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        plan: { select: { name: true } },
        profile: { select: { id: true, username: true } },
      },
    });
    return others
      .filter((other) => other.profile)
      .map((other) => ({
        profileId: other.profile!.id,
        username: other.profile!.username,
        planName: other.plan.name,
        status: other.status,
      }));
  }

  private async profileOfCheckout(
    userId: string,
    named?: string | null,
  ): Promise<string | null> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, ...(named && { id: named }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  // Whether the subscription just paid is a second plan (or add-on) of a
  // Profile that still holds one at the provider, bought from a second tab.
  // That new one ends at once and its payment is refunded in full; the plan
  // the Profile held stays. A held row the provider has ended meanwhile is
  // brought up to date instead, and the new plan is recorded. An add-on
  // never counts against a plan, nor a plan against the add-on, and the
  // person's other Profiles are left alone. Each step is safe to repeat, so
  // a retried notice finishes what a failed one left: the duplicate is
  // marked at the provider before it ends, and a marked one is refunded
  // whatever the Profile holds by then.
  private async refundDuplicatePlan(
    profileId: string,
    subscription: Pick<StripeSubscriptionState, 'id' | 'status' | 'metadata'>,
    addOn: boolean,
  ): Promise<boolean> {
    const stripeSubscriptionId = subscription.id;
    const marked =
      subscription.metadata?.[DUPLICATE_PLAN_METADATA_KEY] === 'true';
    if (
      !marked &&
      !(await this.holdsStandingPlan(profileId, subscription.id, addOn))
    ) {
      return false;
    }

    if (subscription.status !== 'canceled') {
      await this.stripeService.endDuplicateSubscription(stripeSubscriptionId);
    }
    const invoice =
      await this.stripeService.latestPaidInvoice(stripeSubscriptionId);
    if (invoice?.paymentIntentId) {
      await this.stripeService.refundSubscriptionPayment({
        paymentIntentId: invoice.paymentIntentId,
        amountInCents: invoice.paidCents,
        idempotencyKey: `duplicate_plan_${stripeSubscriptionId}`,
        metadata: {
          reason: 'duplicate_plan',
          platformSubscriptionId: stripeSubscriptionId,
        },
      });
    }
    // What the customer balance paid is not on the card: the team returns
    // it, told here as for a withdrawal.
    const owedByStaffCents = invoice
      ? Math.max(0, invoice.totalCents - invoice.paidCents)
      : 0;
    const message = `Second ${addOn ? 'add-on' : 'plan'} ${stripeSubscriptionId} of profile ${profileId}: ended and refunded${
      owedByStaffCents > 0
        ? `; ${owedByStaffCents} cents paid from the customer balance are owed by staff`
        : ''
    }`;
    this.logger.warn(message);
    Sentry.captureMessage(message, {
      level: 'warning',
      tags: { area: 'duplicate-plan' },
      extra: { stripeSubscriptionId, profileId, owedByStaffCents },
    });
    return true;
  }

  // Whether the Profile holds another plan (or add-on) the provider still
  // charges or may charge: active, trialing, overdue, unpaid or paused. A
  // held row the provider has ended is brought up to date on the way.
  private async holdsStandingPlan(
    profileId: string,
    stripeSubscriptionId: string,
    addOn: boolean,
  ): Promise<boolean> {
    const held = await this.prisma.platformSubscription.findMany({
      where: {
        profileId,
        addOn,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
        NOT: { stripeSubscriptionId },
      },
      select: { stripeSubscriptionId: true },
    });
    let standing = false;
    for (const other of held) {
      if (!other.stripeSubscriptionId) continue;
      const atProvider = await this.currentSubscription({
        id: other.stripeSubscriptionId,
      } as StripeSubscriptionState);
      // One the provider does not hold comes back without a status.
      if (!atProvider.status) continue;
      if (STANDING_STATUSES.includes(atProvider.status)) {
        standing = true;
      } else {
        await this.applyStripeSubscription(atProvider);
      }
    }
    return standing;
  }

  async getPortalUrl(
    userId: string,
  ): Promise<Stripe.BillingPortal.Session | { url: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }

    const customerId = await this.ensureStripeCustomer(user);

    return this.stripeService.createPortalSession(
      customerId,
      `${this.frontendUrl}/accounts/billing`,
    );
  }

  // Proxies signature verification to StripeService.
  constructEvent(payload: Buffer, sig: string) {
    return this.stripeService.constructEvent(payload, sig);
  }

  // Main processor for incoming Stripe webhook events.
  // Idempotent: PROCESSED events are skipped; PENDING/FAILED are reprocessed.
  // On handler failure marks FAILED and rethrows (controller returns 5xx).
  // Includes lease-based crash recovery and duplicate delivery protection.
  async processWebhookEvent(event: Stripe.Event) {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { externalId: event.id },
    });

    if (existing?.status === 'PROCESSED') {
      return;
    }

    const now = new Date();
    const leaseCutoff = new Date(now.getTime() - WEBHOOK_LEASE_DURATION_MS);

    if (!existing) {
      try {
        await this.prisma.webhookEvent.create({
          data: {
            provider: 'stripe',
            externalId: event.id,
            payload: event as unknown as object,
            status: 'PENDING',
          },
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          const raced = await this.prisma.webhookEvent.findUnique({
            where: { externalId: event.id },
          });
          if (!raced || raced.status === 'PROCESSED') {
            return;
          }
          if (raced.status === 'PENDING') {
            if (raced.updatedAt > leaseCutoff) {
              return; // Actively held lease
            }
            const { count } = await this.prisma.webhookEvent.updateMany({
              where: {
                externalId: event.id,
                status: 'PENDING',
                updatedAt: { lte: leaseCutoff },
              },
              data: { updatedAt: now },
            });
            if (count === 0) return;
          } else if (raced.status === 'FAILED') {
            const { count } = await this.prisma.webhookEvent.updateMany({
              where: { externalId: event.id, status: 'FAILED' },
              data: { status: 'PENDING', updatedAt: now },
            });
            if (count === 0) return;
          }
        } else {
          throw err;
        }
      }
    } else if (existing.status === 'FAILED') {
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: { externalId: event.id, status: 'FAILED' },
        data: { status: 'PENDING', updatedAt: now },
      });
      if (count === 0) return;
    } else if (existing.status === 'PENDING') {
      // Lease check:
      // If lease is still active, another worker is actively processing it.
      if (existing.updatedAt > leaseCutoff) {
        this.logger.debug(
          `Webhook event ${event.id} is actively being processed (lease active).`,
        );
        return;
      }

      // If lease expired, the previous worker crashed. Atomically claim the expired lease.
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: {
          externalId: event.id,
          status: 'PENDING',
          updatedAt: { lte: leaseCutoff },
        },
        data: { updatedAt: now },
      });
      if (count === 0) {
        return; // Another worker claimed it or state changed
      }
      this.logger.warn(
        `Recovered stuck PENDING webhook event ${event.id} (lease expired, claimed for retry).`,
      );
    }

    try {
      await this.dispatchStripeEvent(event);
      await this.prisma.webhookEvent.update({
        where: { externalId: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error(
        `Webhook event ${event.id} (${event.type}) dispatch failed (${classifyStripeError(err)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.prisma.webhookEvent
        .update({
          where: { externalId: event.id },
          data: { status: 'FAILED' },
        })
        .catch(() => undefined);
      throw err;
    }
  }

  // A renewal being tried again keeps what the plan gives, so a row must not
  // stay PAST_DUE once the provider has stopped trying: no notice may come
  // then. Overdue rows with no news for a day are read again from the
  // provider, a few at a time; each read updates the row, so each is asked
  // about at most once a day. Whether it finished.
  @Cron(CronExpression.EVERY_HOUR)
  async refreshOverdueSubscriptions(limit = 25): Promise<number> {
    const stale = await this.prisma.platformSubscription.findMany({
      where: {
        status: SubscriptionStatus.PAST_DUE,
        updatedAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { stripeSubscriptionId: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    let refreshed = 0;
    for (const { stripeSubscriptionId } of stale) {
      try {
        const current = await this.currentSubscription({
          id: stripeSubscriptionId,
        } as StripeSubscriptionState);
        // One the provider does not hold comes back without a status.
        if (!current.status) continue;
        await this.applyStripeSubscription(current);
        refreshed++;
      } catch (err) {
        this.logger.warn(
          `Could not read overdue subscription ${stripeSubscriptionId} again (${classifyStripeError(err)})`,
        );
      }
    }
    return refreshed;
  }

  /**
   * Periodic reconciliation job:
   * Recovers and processes stuck PENDING webhook events whose lease has expired.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileStuckWebhookEvents(limit = 25): Promise<number> {
    // Withdrawals marked and not finished are finished on the same round;
    // a failure there never stops the notices below.
    await this.finishPendingWithdrawals(limit).catch((err: unknown) =>
      this.logger.error('Failed to finish pending withdrawals', err),
    );

    const leaseCutoff = new Date(Date.now() - WEBHOOK_LEASE_DURATION_MS);

    const stuckEvents = await this.prisma.webhookEvent.findMany({
      where: {
        status: 'PENDING',
        updatedAt: { lte: leaseCutoff },
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    if (stuckEvents.length === 0) {
      return 0;
    }

    this.logger.log(
      `Found ${stuckEvents.length} stuck PENDING webhook events. Starting reconciliation...`,
    );

    let recoveredCount = 0;

    for (const webhook of stuckEvents) {
      // Atomically claim the expired lease
      const now = new Date();
      const { count } = await this.prisma.webhookEvent.updateMany({
        where: {
          id: webhook.id,
          status: 'PENDING',
          updatedAt: { lte: leaseCutoff },
        },
        data: { updatedAt: now },
      });

      if (count === 0) {
        continue; // Claimed by another worker
      }

      try {
        await this.dispatchStripeEvent(
          webhook.payload as unknown as Stripe.Event,
        );
        await this.prisma.webhookEvent.update({
          where: { id: webhook.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
        recoveredCount++;
        this.logger.log(
          `Reconciled and processed stuck webhook event ${webhook.externalId}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to reconcile webhook event ${webhook.externalId}: ${err?.message || err}`,
        );
        await this.prisma.webhookEvent
          .update({
            where: { id: webhook.id },
            data: { status: 'FAILED' },
          })
          .catch(() => undefined);
      }
    }

    return recoveredCount;
  }

  // Mirrors a dispute. Who was charged is read from the provider only when
  // the dispute cannot be tied to an account otherwise; a provider that does
  // not answer never loses the dispute.
  private async syncDispute(dispute: StripeDisputePayload) {
    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    await this.paymentEvents.syncDispute(dispute, async () => {
      if (!chargeId) return undefined;
      try {
        return await this.stripeService.getChargeCustomerId(chargeId);
      } catch {
        this.logger.warn(
          `The customer of the charge of dispute ${dispute.id} could not be read`,
        );
        return undefined;
      }
    });
  }

  private async dispatchStripeEvent(event: Stripe.Event) {
    const { type, data } = event;

    this.logger.log(`Processing Stripe webhook event: ${type}`);

    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const metadata = session.metadata;
        const paymentStatus = session.payment_status as string | undefined;

        // One-time payments must be paid; subscriptions may be unpaid only in edge trial cases
        if (
          session.mode === 'payment' &&
          paymentStatus &&
          paymentStatus !== 'paid'
        ) {
          throw new Error(
            `Checkout session ${session.id} not paid (status=${paymentStatus})`,
          );
        }

        // A checkout made on another account than CircleSfera's is never
        // CircleSfera's sale: it is ignored. Promotions are fulfilled by
        // PaymentEventsService; plans below. Both share this webhook's
        // signature verification and WebhookEvent idempotency bookkeeping.
        if (event.account) {
          this.logger.warn(
            `Checkout ${session.id} on account ${event.account} is not CircleSfera's; ignored`,
          );
        } else if (isOneTimeCheckoutType(metadata?.type)) {
          await this.paymentEvents.handleCheckoutSessionCompleted(session);
        } else {
          // Handle Subscriptions (Existing logic)
          const userId = metadata?.userId;
          const planId = metadata?.planId;
          const stripeSubscriptionId = session.subscription as string;

          if (!userId || !planId || !stripeSubscriptionId) {
            this.logger.warn(
              'Checkout session completed but missing metadata or subscription ID',
            );
            return;
          }

          // The Profile the plan was bought for. A checkout started before
          // plans were per Profile names none: it goes to the oldest Profile
          // of the person. One named must be the person's own.
          const profileId = await this.profileOfCheckout(
            userId,
            metadata?.profileId,
          );
          if (!profileId) {
            this.logger.warn(
              `Checkout session completed for user ${userId} without a Profile to give the plan to`,
            );
            return;
          }

          const subscriptionRaw =
            await this.stripeService.getSubscription(stripeSubscriptionId);
          const stripeSubscription = subscriptionRaw as unknown as {
            id: string;
            status: string;
            cancel_at_period_end: boolean;
            start_date?: number;
            metadata?: Record<string, string> | null;
          } & SubscriptionWithItems;
          const period = subscriptionPeriod(stripeSubscription);

          const plan = await this.prisma.platformPlan.findUnique({
            where: { id: planId },
          });
          const addOn = plan?.addOn ?? false;

          // A Profile holds one plan (and one add-on). One paid while it
          // already had one is a duplicate: it ends and is paid back, and the
          // plan held stays.
          if (
            await this.refundDuplicatePlan(
              profileId,
              { ...stripeSubscription, id: stripeSubscriptionId },
              addOn,
            )
          ) {
            return;
          }

          // A notice retried after a withdrawal leaves the row CANCELLED:
          // both writes commit together.
          await this.prisma.$transaction(async (tx) => {
            await this.keepYearlyMove(tx, stripeSubscription, period);
            await tx.platformSubscription.upsert({
              where: { stripeSubscriptionId },
              update: {
                status: this.mapStripeStatus(stripeSubscription.status),
                currentPeriodStart: period.start,
                currentPeriodEnd: period.end,
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
                profileId,
                ...providerStart(stripeSubscription),
                ...providerInterval(stripeSubscription),
              },
              create: {
                userId,
                planId,
                profileId,
                status: this.mapStripeStatus(stripeSubscription.status),
                stripeSubscriptionId: stripeSubscriptionId,
                currentPeriodStart: period.start,
                currentPeriodEnd: period.end,
                cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
                addOn,
                ...providerStart(stripeSubscription),
                ...providerInterval(stripeSubscription),
              },
            });
            await this.keepWithdrawnEnded(tx, stripeSubscriptionId);
          });
          await this.stopAddOnBesidePlanWithStudioPro(profileId);

          // Phase 3: Elevate account type and verification level based on plan
          if (plan) {
            await this.usersService.syncUserTier(userId);
          }

          this.logger.log(
            `Successfully processed checkout for user ${userId}, plan ${planId}`,
          );

          if (plan) {
            const user = await this.prisma.user.findUnique({
              where: { id: userId },
              select: { email: true },
            });
            if (user) {
              const formattedAmount = new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: session.currency?.toUpperCase() || 'EUR',
              }).format((session.amount_total || 0) / 100);
              this.emailService
                .sendSubscriptionReceipt(user.email, plan.name, formattedAmount)
                .catch((e) => this.logger.error(e));
            }
          }

          const alertEvent: PaymentAlertEvent['payload'] = {
            eventType: 'Platform Subscription Checkout',
            amount: session.amount_total || 0,
            currency: session.currency || 'eur',
            description: `User ${userId} subscribed to plan ${planId}`,
            userId: userId,
          };
          this.eventEmitter.emit('payment.alert', alertEvent);
        }

        break;
      }

      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const named = data.object as unknown as StripeSubscriptionState;
        await this.applyStripeSubscription(
          await this.currentSubscription(named),
        );
        break;
      }

      case 'identity.verification_session.verified':
      case 'identity.verification_session.canceled':
      case 'identity.verification_session.requires_input': {
        const session = data.object as Stripe.Identity.VerificationSession;
        await this.usersService.handleIdentityWebhook(session);
        break;
      }

      case 'checkout.session.expired': {
        await this.paymentEvents.handleCheckoutSessionExpired(data.object);
        break;
      }

      case 'invoice.payment_failed': {
        // The subscription of an invoice is named under its parent.
        const invoice = data.object as {
          parent?: {
            subscription_details?: {
              subscription?: string | { id: string } | null;
            } | null;
          } | null;
        };
        const named = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof named === 'string' ? named : named?.id;
        if (subscriptionId) {
          // The subscription is read from the provider, not assumed overdue:
          // a declined move to the yearly price leaves the plan active at
          // its monthly price, and its benefits stay. A withdrawn plan stays
          // ended (applyStripeSubscription keeps it so). One the provider
          // does not hold comes back without a status: nothing to apply.
          const current = await this.currentSubscription({
            id: subscriptionId,
          } as StripeSubscriptionState);
          if (current.status) {
            await this.applyStripeSubscription(current);
          } else {
            this.logger.warn(
              `Failed invoice of subscription ${subscriptionId}, which the provider does not hold`,
            );
          }
        }
        break;
      }

      case 'charge.refunded': {
        await this.paymentEvents.handleChargeRefunded(
          data.object as StripeRefundedCharge,
        );
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        const dispute = data.object as StripeDisputePayload;
        await this.syncDispute(dispute);
        await this.paymentEvents.applyDisputeToPayment(dispute);
        break;
      }

      default:
        this.logger.warn(`Unhandled Stripe event type: ${type}`);
        Sentry.captureMessage(`Unhandled Stripe event: ${type}`, 'warning');
    }
  }
}
