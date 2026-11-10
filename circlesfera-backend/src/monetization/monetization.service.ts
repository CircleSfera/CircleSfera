import { ErrorCode, type PaymentAlertEvent } from '@circlesfera/shared';
import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  canMonetize,
  MIN_TIP_CENTS,
} from '../common/constants/monetization.constants.js';
import { withdrawalConsentMetadata } from '../common/consumer/withdrawal-consent.js';
import { AppException } from '../common/errors/app.exception.js';
import { assertAdultPayer } from '../common/policies/adult-payer.policy.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import {
  SELLABLE_POST,
  SELLABLE_STORY,
} from '../common/policies/removed-content.policy.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import {
  CREATOR_PAYMENT_METHODS,
  creatorPaymentTax,
} from '../common/stripe/creator-payment-tax.js';
import {
  deriveConnectAccountFlags,
  isTransferOnlyAccount,
  isVerifiedCompanyAccount,
  StripeService,
} from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { INCOME_ROWS_SQL, INCOME_TYPES, SHARE_SQL } from './earnings-sql.js';
import { creatorEarnings } from './paid-amounts.js';
import {
  accountTakingPayments,
  assertOfChargingAge,
  canBePaid,
  PAYABLE_PROFILE_SELECT,
  payoutAccountPlacement,
  payoutDestinationFor,
  payoutRowForProfile,
} from './payout-account.js';

function appendCheckoutQuery(returnUrl: string, query: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${query}`;
}

// What a tip reads of the Profile tipped, to pay its person and to know
// whether it may receive one.
const TIPPED_PROFILE_SELECT = {
  id: true,
  userId: true,
  username: true,
  ...PAYABLE_PROFILE_SELECT,
} as const;

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async getMonetization(userId: string, profileId: string) {
    let monetization = await this.prisma.monetization.findUnique({
      where: { userId },
    });
    if (!monetization) {
      monetization = await this.prisma.monetization.create({
        data: {
          userId,
          ...(await payoutAccountPlacement(this.prisma, userId)),
        },
      });
    }

    // The accounts and the Profiles holding them stay on the server; the app
    // hears whether the active Profile is paid into an account, and what
    // that Profile has earned (the row's own counter is the person's).
    const {
      stripeConnectAccountId: _account,
      profileId: _holder,
      ...row
    } = monetization;
    return {
      ...row,
      lifetimeEarningsCents: await this.profileEarnings(userId, profileId),
      hasStripeAccount: !!(await this.accountOf(userId, profileId)),
    };
  }

  /**
   * What a Profile of the person has earned: their share of each completed
   * payment the Profile received. A refunded payment no longer counts.
   */
  private async profileEarnings(
    userId: string,
    profileId: string,
  ): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ earned: bigint }[]>`
      SELECT COALESCE(SUM(${SHARE_SQL}), 0)::bigint AS earned
      FROM transactions t
      WHERE ${INCOME_ROWS_SQL(userId)} AND t."receiverProfileId" = ${profileId}`;
    return Number(row?.earned ?? 0);
  }

  /**
   * The payout row the active Profile's screens show: its own account, also
   * while it is still being set up, else the one it is paid into.
   */
  private async shownPayoutRow(userId: string, profileId: string) {
    const own = await this.prisma.monetization.findUnique({
      where: { profileId },
      select: {
        userId: true,
        profileId: true,
        stripeConnectAccountId: true,
        transfersEnabled: true,
        chargesEnabled: true,
      },
    });
    if (own?.stripeConnectAccountId) return own;
    return payoutRowForProfile(this.prisma, { id: profileId, userId });
  }

  /** The payout account the active Profile's screens show. */
  private async accountOf(
    userId: string,
    profileId: string,
  ): Promise<string | null> {
    const row = await this.shownPayoutRow(userId, profileId);
    return row?.stripeConnectAccountId ?? null;
  }

  // The history of the active Profile: what it received, and what the
  // person paid (a payment is the person's and names no Profile).
  async getTransactions(
    userId: string,
    profileId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      OR: [
        { senderId: userId },
        { receiverId: userId, receiverProfileId: profileId },
      ],
    };
    // Only what the history shows: no person or Profile on either side and
    // no provider ids, so a payment never tells who is behind a Profile.
    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        vatCents: true,
        refundedCents: true,
        currency: true,
        status: true,
        createdAt: true,
        receiverId: true,
        receiverProfileId: true,
      },
    });

    const total = await this.prisma.transaction.count({ where });

    return {
      data: transactions.map(({ receiverId, receiverProfileId, ...tx }) => ({
        ...tx,
        incoming: receiverId === userId && receiverProfileId === profileId,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // NEW DIRECT MONETIZATION METHODS

  // Single builder for the "pay creator directly on their own account"
  // Checkout Session shape shared by createPostUnlockSession,
  // createStoryUnlockSession, createMessageUnlockSession and
  // createTipSession — each method keeps its own entity-specific
  // pre-checks (price bounds, self-purchase, already-unlocked, etc.) and
  // only delegates the actual Stripe session construction here.
  private async createCreatorCheckout(params: {
    buyerId: string;
    buyerEmail: string;
    priceCents: number;
    productName: string;
    description: string;
    creatorStripeAccountId: string;
    metadata: Record<string, string>;
    returnUrl: string;
    idempotencyKey?: string;
    // When the checkout closes, in seconds since the epoch; Stripe's default
    // of 24 hours when not given.
    expiresAt?: number;
  }): Promise<{ url: string | null }> {
    await assertRealMoneyAllowed(this.prisma, params.buyerId);
    await assertAdultPayer(this.prisma, params.buyerId);
    const taxActive = await this.stripeService.creatorTaxActive(
      params.creatorStripeAccountId,
    );

    const session = await this.stripeService.createCheckoutSession(
      {
        ...CREATOR_PAYMENT_METHODS,
        mode: 'payment',
        customer_email: params.buyerEmail,
        client_reference_id: params.buyerId,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: params.productName,
                description: params.description,
              },
              unit_amount: params.priceCents,
              tax_behavior: 'inclusive',
            },
            quantity: 1,
          },
        ],
        ...creatorPaymentTax({ priceCents: params.priceCents, taxActive }),
        metadata: params.metadata,
        ...(params.expiresAt !== undefined && {
          expires_at: params.expiresAt,
        }),
        success_url: appendCheckoutQuery(
          params.returnUrl,
          'success=true&session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: appendCheckoutQuery(params.returnUrl, 'canceled=true'),
      },
      {
        stripeAccount: params.creatorStripeAccountId,
        idempotencyKey: params.idempotencyKey,
      },
    );

    return { url: session.url };
  }

  async createPostUnlockSession(
    userId: string,
    profileId: string,
    postId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    // A post moderation hid or removed is sold to nobody.
    const post = await this.prisma.post.findUnique({
      where: { id: postId, ...SELLABLE_POST },
      include: { profile: { include: { user: true } } },
    });

    if (!post?.isPremium || !post.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This post is not premium or has no price',
      );
    }
    if (post.profileId === profileId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot buy your own post',
      );
    }

    const creator = (post as any).profile.user;
    const payout = await payoutDestinationFor(this.prisma, {
      id: post.profileId,
      userId: creator.id,
    });
    const creatorAccount = accountTakingPayments(payout);

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    return this.createCreatorCheckout({
      buyerId: userId,
      buyerEmail: buyer.email,
      priceCents: post.priceCents,
      productName: 'Post unlock',
      // Who pays sees the Profile, never the creator's email.
      description: `Unlock exclusive content from @${(post as any).profile.username}`,
      creatorStripeAccountId: creatorAccount,
      metadata: {
        type: 'DIRECT_POST_UNLOCK',
        ...withdrawalConsentMetadata(),
        postId: postId,
        creatorId: creator.id,
      },
      returnUrl,
      idempotencyKey,
    });
  }

  async createStoryUnlockSession(
    userId: string,
    profileId: string,
    storyId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    // A story moderation hid or removed is sold to nobody.
    const story = await this.prisma.story.findUnique({
      where: { id: storyId, ...SELLABLE_STORY },
      include: { profile: { include: { user: true } } },
    });

    if (!story?.isPremium || !story.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This story is not premium or has no price',
      );
    }
    if (story.profileId === profileId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot buy your own story',
      );
    }

    const existing = await this.prisma.storyUnlock.findUnique({
      where: { userId_storyId: { userId, storyId } },
    });
    if (existing) {
      throw AppException.BadRequest(
        ErrorCode.CONTENT_ALREADY_UNLOCKED,
        'Story already unlocked',
      );
    }

    const creator = (story as any).profile.user;
    const payout = await payoutDestinationFor(this.prisma, {
      id: story.profileId,
      userId: creator.id,
    });
    const creatorAccount = accountTakingPayments(payout);

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    return this.createCreatorCheckout({
      buyerId: userId,
      buyerEmail: buyer.email,
      priceCents: story.priceCents,
      productName: 'Story unlock',
      description: `Unlock exclusive story from @${(story as any).profile.username}`,
      creatorStripeAccountId: creatorAccount,
      metadata: {
        type: 'DIRECT_STORY_UNLOCK',
        ...withdrawalConsentMetadata(),
        storyId,
        creatorId: creator.id,
      },
      returnUrl,
      idempotencyKey,
    });
  }

  // Messages are no longer sold. Asking to buy one still answers why: one
  // gone or without a price as before, and one with a price as no longer
  // for sale. Who bought one already keeps it open.
  async createMessageUnlockSession(messageId: string): Promise<never> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { isDeleted: true, isLocked: true, priceCents: true },
    });

    // A message its sender deleted cannot be bought, as one that is gone.
    if (!message || message.isDeleted) {
      throw AppException.NotFound(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
    }
    if (!message.isLocked || !message.priceCents) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        'This message is not locked or has no price',
      );
    }
    throw AppException.BadRequest(
      ErrorCode.PAID_MESSAGES_UNAVAILABLE,
      'Paid messages are no longer available.',
    );
  }

  async createTipSession(
    senderId: string,
    receiverId: string,
    amountCents: number,
    returnUrl: string,
    postId?: string,
    idempotencyKey?: string,
    senderProfileId?: string,
  ) {
    if (amountCents < MIN_TIP_CENTS) {
      throw AppException.BadRequest(
        ErrorCode.MINIMUM_TIP_NOT_MET,
        `Minimum tip is €${(MIN_TIP_CENTS / 100).toFixed(2)}`,
      );
    }
    // The app names the Profile tipped; the person behind it is paid. A
    // person's id is still accepted: then their first Profile is checked,
    // and no Profile is named or kept.
    const named = await this.prisma.profile.findUnique({
      where: { id: receiverId },
      select: TIPPED_PROFILE_SELECT,
    });
    // The post a tip is for is one of the Profile tipped. When a person is
    // named, the Profile tipped is the one the post belongs to, so every
    // check below is about it.
    let tipped = named;
    if (postId) {
      // No tip for a post moderation hid or removed.
      const post = await this.prisma.post.findUnique({
        where: { id: postId, ...SELLABLE_POST },
        select: { profileId: true, profile: { select: TIPPED_PROFILE_SELECT } },
      });
      const ofTipped = named
        ? post?.profileId === named.id
        : post?.profile.userId === receiverId;
      if (!post || !ofTipped) {
        throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
      }
      tipped = post.profile;
    }
    tipped ??= await this.prisma.profile.findFirst({
      where: { userId: receiverId },
      orderBy: { createdAt: 'asc' },
      select: TIPPED_PROFILE_SELECT,
    });
    const receiverUserId = tipped?.userId ?? receiverId;
    if (senderId === receiverUserId)
      throw AppException.BadRequest(
        ErrorCode.CANNOT_TIP_SELF,
        'Cannot tip yourself',
      );

    // A Profile that is banned or suspended, of a person no longer here, or
    // across a block with who tips, is not found, as everywhere else.
    if (
      !tipped ||
      !canBePaid(tipped) ||
      (senderProfileId &&
        (await isBlockedEitherWay(this.prisma, senderProfileId, tipped.id)))
    ) {
      throw AppException.NotFound(
        ErrorCode.USER_NOT_FOUND,
        'Creator not found',
      );
    }

    const payout = await payoutRowForProfile(this.prisma, tipped);
    const creatorAccount = accountTakingPayments(payout);

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender)
      throw AppException.NotFound(
        ErrorCode.SENDER_NOT_FOUND,
        'Sender not found',
      );

    return this.createCreatorCheckout({
      buyerId: senderId,
      buyerEmail: sender.email,
      priceCents: amountCents,
      productName: 'Creator Tip',
      // Who pays sees the Profile they tip, never the creator's email.
      description: named ? `Tip for @${named.username}` : 'Creator Tip',
      creatorStripeAccountId: creatorAccount,
      metadata: {
        type: 'DIRECT_TIP',
        creatorId: receiverUserId,
        // The Profile tipped, kept with the tip; none when a person is named.
        profileId: named?.id ?? '',
        // Who tips, as the Profile they tipped from, for the notice.
        senderProfileId: senderProfileId ?? '',
        postId: postId || '',
      },
      returnUrl,
      idempotencyKey,
    });
  }

  async onboardConnectAccount(
    userId: string,
    profileId: string,
    returnUrl: string,
    refreshUrl: string,
  ) {
    await assertRealMoneyAllowed(this.prisma, userId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    // The account is the active Profile's, which must earn.
    const profile = await this.prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: { id: true, accountType: true, username: true },
    });
    if (!profile || !canMonetize(profile.accountType)) {
      throw AppException.Forbidden(
        ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
        'Only Creator or Business accounts can enable payments with Stripe.',
      );
    }
    await assertOfChargingAge(this.prisma, userId);

    try {
      const accountId = await this.accountTakingCardPayments(
        user.email,
        await this.payoutAccountToOnboard(user, profile.id),
      );
      await this.keepCreatorWebsite(accountId, profile.username);
      const link = await this.stripeService.createAccountLink(
        accountId,
        returnUrl,
        refreshUrl,
      );
      return { url: link.url };
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;
      this.logger.error('Stripe Connect Onboarding Error:', error);
      throw AppException.BadRequest(
        ErrorCode.STRIPE_ONBOARDING_FAILED,
        error instanceof Error
          ? error.message
          : 'Failed to connect with Stripe',
      );
    }
  }

  /**
   * Gives a payout account the address of its Profile's public page, which
   * the provider asks of every creator. A failure is written down and never
   * stops what was being done: it is sent again the next time.
   */
  async keepCreatorWebsite(accountId: string, username: string) {
    try {
      await this.stripeService.setCreatorWebsite(accountId, username);
    } catch (error) {
      this.logger.warn(
        `The profile address of payout account ${accountId} could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * The account a Profile connects: its own; else the person's first, when
   * no other Profile holds it; else a new one for this Profile only, so two
   * Profiles never share balances, payouts or disputes.
   */
  private async payoutAccountToOnboard(
    user: { id: string; email: string },
    profileId: string,
  ): Promise<string> {
    const own = await this.prisma.monetization.findUnique({
      where: { profileId },
      select: { stripeConnectAccountId: true },
    });
    if (own?.stripeConnectAccountId) return own.stripeConnectAccountId;

    const person = await this.prisma.monetization.findUnique({
      where: { userId: user.id },
      select: { profileId: true, stripeConnectAccountId: true },
    });
    // Keyed on the person, so a request repeated after the row failed to be
    // written gets the same account back from the provider.
    const first =
      person?.stripeConnectAccountId ??
      (
        await this.stripeService.createExpressAccount(
          user.email,
          `connect-account-${user.id}`,
        )
      ).id;

    // The person's first account, kept on their row, with the Profile
    // holding it: the one connecting, unless another Profile holds it
    // already. A row with no account yet holds nothing, whichever Profile it
    // was opened from.
    if (
      person?.stripeConnectAccountId &&
      person.profileId &&
      person.profileId !== profileId
    ) {
      return this.openProfileAccount(user.email, profileId);
    }
    // Claimed in one write, so two Profiles connecting at once never both
    // take it: the row changes only while it holds nothing or this Profile.
    const claimed = await this.prisma.monetization.updateMany({
      where: {
        userId: user.id,
        OR: [
          { stripeConnectAccountId: null },
          { profileId: null },
          { profileId },
        ],
      },
      data: { profileId, stripeConnectAccountId: first },
    });
    if (claimed.count === 0 && !person) {
      try {
        await this.prisma.monetization.create({
          data: { userId: user.id, profileId, stripeConnectAccountId: first },
        });
      } catch (error) {
        // Another request opened the row meanwhile: it is read below.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    const held = await this.prisma.monetization.findUnique({
      where: { userId: user.id },
      select: { profileId: true },
    });
    if (held?.profileId === profileId) return first;
    return this.openProfileAccount(user.email, profileId);
  }

  /**
   * The account to onboard, able to take card payments. One opened before
   * creators sold on their own account can only receive transfers: while it
   * holds no money it is replaced on the row holding it by a new one, and is
   * left as it is at the provider. One that holds money is left to staff.
   */
  private async accountTakingCardPayments(
    email: string,
    accountId: string,
  ): Promise<string> {
    const account = await this.stripeService.getAccount(accountId);
    if (!isTransferOnlyAccount(account)) return accountId;

    const balance = await this.stripeService.getConnectBalance(accountId);
    const held = [...balance.available, ...balance.pending].some(
      (funds) => funds.amount !== 0,
    );
    if (held) {
      const alert: PaymentAlertEvent['payload'] = {
        eventType: 'Payout Account Replacement Needed',
        description: `Payout account ${accountId} takes no card payments and holds a balance: replace it by hand`,
      };
      this.eventEmitter?.emit('payment.alert', alert);
      throw AppException.BadRequest(
        ErrorCode.STRIPE_ONBOARDING_FAILED,
        'Your payout account must be updated by our team before you can sell',
      );
    }

    // Keyed on the old account, so a repeated request gets the same one.
    const replacement = await this.stripeService.createExpressAccount(
      email,
      `connect-account-${accountId}-direct`,
    );
    await this.prisma.monetization.updateMany({
      where: { stripeConnectAccountId: accountId },
      data: {
        stripeConnectAccountId: replacement.id,
        transfersEnabled: false,
        chargesEnabled: false,
        verifiedCompany: false,
      },
    });
    this.logger.log(
      `Payout account ${accountId} replaced by ${replacement.id} to take card payments`,
    );
    return replacement.id;
  }

  /** A new account for one Profile only, kept on the Profile's own row. */
  private async openProfileAccount(
    email: string,
    profileId: string,
  ): Promise<string> {
    const account = await this.stripeService.createExpressAccount(
      email,
      `connect-account-${profileId}`,
    );
    await this.prisma.monetization.upsert({
      where: { profileId },
      update: { stripeConnectAccountId: account.id },
      create: { profileId, stripeConnectAccountId: account.id },
    });
    return account.id;
  }

  async getAccountStatus(userId: string, profileId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    // The account the active Profile is paid into, and the flags last saved
    // for it; ownAccount says whether it is the Profile's own.
    const cached = await this.shownPayoutRow(userId, profileId);
    const accountId = cached?.stripeConnectAccountId;
    if (!accountId) {
      return {
        connected: false,
        ownAccount: false,
        transfersEnabled: false,
        chargesEnabled: false,
      };
    }
    const ownAccount = cached.profileId === profileId;

    try {
      const account = await this.stripeService.getAccount(accountId);
      const { transfersEnabled, chargesEnabled } =
        deriveConnectAccountFlags(account);
      const verifiedCompany = isVerifiedCompanyAccount(account);
      // Only a person's row is placed again; a Profile's own row stays its.
      const placed = cached.userId
        ? await payoutAccountPlacement(this.prisma, cached.userId)
        : {};
      await this.prisma.monetization.update({
        where: { stripeConnectAccountId: accountId },
        data: { ...placed, transfersEnabled, chargesEnabled, verifiedCompany },
      });
      return {
        connected: true,
        ownAccount,
        transfersEnabled,
        chargesEnabled,
        detailsSubmitted: account.details_submitted,
      };
    } catch (error) {
      this.logger.error('Stripe Get Account Error:', error);
      return {
        connected: true,
        ownAccount,
        transfersEnabled: cached.transfersEnabled,
        chargesEnabled: cached.chargesEnabled,
        detailsSubmitted: false,
      };
    }
  }

  async getDashboardLink(userId: string, profileId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const accountId = await this.accountOf(userId, profileId);
    if (!accountId) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CONNECT_NOT_SETUP,
        'Stripe Connect account not set up yet',
      );
    }

    const link = await this.stripeService.createLoginLink(accountId);
    return { url: link.url };
  }

  /**
   * A session of the provider's panels where the creator keeps the tax
   * details of their own payout account: where they are based and where
   * they are registered for VAT. Only a Profile's own account: one paid
   * into another Profile's account has nothing of its own to set.
   */
  async createTaxDetailsSession(
    userId: string,
    profileId: string,
  ): Promise<{ clientSecret: string; publishableKey: string }> {
    const accountId = await this.ownPayoutAccount(userId, profileId);
    const publishableKey = this.stripeService.embeddedPanelsPublishableKey();
    if (!publishableKey) {
      this.logger.error(
        'STRIPE_PUBLISHABLE_KEY is not set, or is not of the mode of the secret key',
      );
      throw new AppException(
        ErrorCode.INTERNAL_SERVER_ERROR,
        HttpStatus.SERVICE_UNAVAILABLE,
        'Tax details are not available right now',
      );
    }
    const clientSecret =
      await this.stripeService.createTaxDetailsSession(accountId);
    return { clientSecret, publishableKey };
  }

  /**
   * What the tax details of the active Profile's own payout account hold,
   * for the rows of the settings: where it is based (city and country), and
   * the countries where it is registered for VAT.
   */
  async getTaxDetailsStatus(userId: string, profileId: string) {
    const accountId = await this.ownPayoutAccount(userId, profileId);
    return this.stripeService.getTaxDetailsStatus(accountId);
  }

  /**
   * The active Profile's own payout account. None when it has none, or is
   * paid into another Profile's; nor for a Test Account where money is real.
   */
  private async ownPayoutAccount(
    userId: string,
    profileId: string,
  ): Promise<string> {
    await assertRealMoneyAllowed(this.prisma, userId);
    const row = await this.shownPayoutRow(userId, profileId);
    if (!row?.stripeConnectAccountId || row.profileId !== profileId) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CONNECT_NOT_SETUP,
        'This Profile has no payout account of its own',
      );
    }
    return row.stripeConnectAccountId;
  }

  // Read-only Stripe Connect balance + recent payouts (no internal payout ledger).
  async getConnectPayoutsSummary(
    userId: string,
    profileId: string,
  ): Promise<{
    available: { amountCents: number; currency: string }[];
    pending: { amountCents: number; currency: string }[];
    payouts: {
      id: string;
      amountCents: number;
      currency: string;
      status: string;
      arrivalDate: string | null;
      createdAt: string;
      method: string;
      type: string;
    }[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    const accountId = await this.accountOf(userId, profileId);
    if (!accountId) {
      throw AppException.BadRequest(
        ErrorCode.STRIPE_CONNECT_NOT_SETUP,
        'Stripe Connect account not set up yet',
      );
    }

    const [balance, payouts] = await Promise.all([
      this.stripeService.getConnectBalance(accountId),
      this.stripeService.listConnectPayouts(accountId, 10),
    ]);

    const mapAmount = (amounts: { amount: number; currency: string }[]) =>
      amounts.map((a) => ({
        amountCents: a.amount,
        currency: a.currency.toUpperCase(),
      }));

    return {
      available: mapAmount(balance.available),
      pending: mapAmount(balance.pending),
      payouts: payouts.data.map((p) => ({
        id: p.id,
        amountCents: p.amount,
        currency: p.currency.toUpperCase(),
        status: p.status,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        createdAt: new Date(p.created * 1000).toISOString(),
        method: p.method,
        type: p.type,
      })),
    };
  }

  // The income of the active Profile by month, for the last six months.
  async getIncomeStats(userId: string, profileId: string) {
    // The first day of this month and of the five before it, in UTC as the
    // months are keyed. Counted from the first of the month: from the 31st,
    // a month back would land past a shorter month and name one twice.
    const now = new Date();
    const monthStart = (back: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const sixMonthsAgo = monthStart(5);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        receiverId: userId,
        receiverProfileId: profileId,
        status: 'COMPLETED',
        type: { in: [...INCOME_TYPES] },
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        amount: true,
        vatCents: true,
        refundedCents: true,
        createdAt: true,
      },
    });

    const months = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      months.set(monthStart(i).toISOString().slice(0, 7), 0); // YYYY-MM
    }

    for (const tx of transactions) {
      const key = tx.createdAt.toISOString().slice(0, 7);
      if (months.has(key)) {
        months.set(
          key,
          months.get(key)! +
            creatorEarnings(tx.amount, tx.vatCents, tx.refundedCents),
        );
      }
    }

    return Array.from(months.entries()).map(([month, income]) => ({
      month,
      income,
    }));
  }

  // This month's income, the tips and the income by kind of the active
  // Profile: the creator's share of each payment, as everywhere on these
  // screens.
  async getFinancialSummary(userId: string, profileId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const byType = await this.prisma.$queryRaw<
      { type: string; earned: bigint; earnedThisMonth: bigint }[]
    >`
      SELECT t.type::text AS type,
        COALESCE(SUM(${SHARE_SQL}), 0)::bigint AS earned,
        COALESCE(SUM(${SHARE_SQL}) FILTER (WHERE t."createdAt" >= ${monthStart}), 0)::bigint
          AS "earnedThisMonth"
      FROM transactions t
      WHERE ${INCOME_ROWS_SQL(userId)} AND t."receiverProfileId" = ${profileId}
      GROUP BY t.type`;

    const earned = (type: (typeof INCOME_TYPES)[number]) =>
      Number(byType.find((row) => row.type === type)?.earned ?? 0);

    return {
      currentMonthIncome: byType.reduce(
        (sum, row) => sum + Number(row.earnedThisMonth),
        0,
      ),
      totalTips: earned('DIRECT_TIP'),
      breakdown: {
        postUnlocks: earned('DIRECT_POST_UNLOCK'),
        storyUnlocks: earned('DIRECT_STORY_UNLOCK'),
        messageUnlocks: earned('DIRECT_MESSAGE_UNLOCK'),
        tips: earned('DIRECT_TIP'),
        liveGifts: earned('DIRECT_LIVE_GIFT'),
      },
    };
  }

  /**
   * The person's total over all their Profiles: each Profile with what it
   * has earned in all and this month, and whether it has a payout account
   * of its own. Income that names none of the person's Profiles (recorded
   * before income named its Profile, to a Profile since deleted, or for a
   * post or story deleted before it was recorded) counts in the total only.
   * Balances stay on each Profile's screen: an account can be shared by
   * Profiles, so they are not summed here.
   */
  async getPersonTotal(userId: string) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [profiles, byProfile, ownRows] = await Promise.all([
      this.prisma.profile.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          username: true,
          avatar: true,
          accountType: true,
        },
      }),
      this.prisma.$queryRaw<
        {
          receiverProfileId: string | null;
          earned: bigint;
          earnedThisMonth: bigint;
        }[]
      >`
        SELECT t."receiverProfileId" AS "receiverProfileId",
          COALESCE(SUM(${SHARE_SQL}), 0)::bigint AS earned,
          COALESCE(SUM(${SHARE_SQL}) FILTER (WHERE t."createdAt" >= ${monthStart}), 0)::bigint
            AS "earnedThisMonth"
        FROM transactions t
        WHERE ${INCOME_ROWS_SQL(userId)}
        GROUP BY t."receiverProfileId"`,
      this.prisma.monetization.findMany({
        where: {
          profile: { userId },
          stripeConnectAccountId: { not: null },
        },
        select: { profileId: true },
      }),
    ]);

    const withOwnAccount = new Set(ownRows.map((row) => row.profileId));
    const ofProfile = new Map(
      byProfile.map((row) => [row.receiverProfileId, row]),
    );
    const own = new Set(profiles.map((profile) => profile.id));
    const sum = (rows: typeof byProfile, field: 'earned' | 'earnedThisMonth') =>
      rows.reduce((total, row) => total + Number(row[field]), 0);
    const other = byProfile.filter(
      (row) => !row.receiverProfileId || !own.has(row.receiverProfileId),
    );

    return {
      totalEarningsCents: sum(byProfile, 'earned'),
      currentMonthEarningsCents: sum(byProfile, 'earnedThisMonth'),
      unassignedEarningsCents: sum(other, 'earned'),
      unassignedCurrentMonthEarningsCents: sum(other, 'earnedThisMonth'),
      profiles: profiles.map((profile) => {
        const row = ofProfile.get(profile.id);
        return {
          profileId: profile.id,
          username: profile.username,
          avatar: profile.avatar,
          accountType: profile.accountType,
          ownPayoutAccount: withOwnAccount.has(profile.id),
          earningsCents: Number(row?.earned ?? 0),
          currentMonthEarningsCents: Number(row?.earnedThisMonth ?? 0),
        };
      }),
    };
  }
}
