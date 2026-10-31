import { ErrorCode } from '@circlesfera/shared';
import { Injectable, Logger } from '@nestjs/common';
import {
  canMonetize,
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
  MIN_TIP_CENTS,
  PLATFORM_FEE_DECIMAL,
} from '../common/constants/monetization.constants.js';
import { withdrawalConsentMetadata } from '../common/consumer/withdrawal-consent.js';
import { AppException } from '../common/errors/app.exception.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import {
  LISTED_POST,
  NOT_REMOVED,
} from '../common/policies/removed-content.policy.js';
import { assertRealMoneyAllowed } from '../common/policies/test-account.policy.js';
import { creatorPaymentTax } from '../common/stripe/creator-payment-tax.js';
import {
  deriveConnectAccountFlags,
  isVerifiedCompanyAccount,
  StripeService,
} from '../common/stripe/stripe.service.js';
import { withPrimaryProfile } from '../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
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

// How long the checkout of a paid message stays open, in seconds. The message
// can be erased meanwhile, so the window is kept short: Stripe's shortest is
// 30 minutes after it creates the session, and the extra minute covers the
// time the request takes and any difference between the two clocks.
const MESSAGE_CHECKOUT_LIFETIME_SECONDS = 31 * 60;

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

    // The person's earnings. The accounts and the Profiles holding them stay
    // on the server; the app hears whether the active Profile is paid into
    // an account.
    const {
      stripeConnectAccountId: _account,
      profileId: _holder,
      ...earnings
    } = monetization;
    return {
      ...earnings,
      hasStripeAccount: !!(await this.accountOf(userId, profileId)),
    };
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

  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            profiles: {
              select: { username: true, avatar: true },
              take: 1,
            },
          },
        },
        receiver: {
          select: {
            id: true,
            profiles: {
              select: { username: true, avatar: true },
              take: 1,
            },
          },
        },
      },
    });

    const total = await this.prisma.transaction.count({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });

    return {
      data: transactions.map((tx) => ({
        ...tx,
        sender: tx.sender ? withPrimaryProfile(tx.sender) : null,
        receiver: tx.receiver ? withPrimaryProfile(tx.receiver) : null,
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

  // Single builder for the "pay creator directly via destination charge"
  // Checkout Session shape shared by createPostUnlockSession,
  // createStoryUnlockSession, createMessageUnlockSession and
  // createTipSession — each method keeps its own entity-specific
  // pre-checks (price bounds, self-purchase, already-unlocked, etc.) and
  // only delegates the actual Stripe session construction here.
  private async createDestinationChargeCheckout(params: {
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
    const platformFee = Math.floor(params.priceCents * PLATFORM_FEE_DECIMAL);

    const session = await this.stripeService.createCheckoutSession(
      {
        ...this.stripeService.cardOnlyPaymentMethods(),
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
              tax_behavior: 'exclusive',
            },
            quantity: 1,
          },
        ],
        ...creatorPaymentTax({
          priceCents: params.priceCents,
          platformFeeCents: platformFee,
          destination: params.creatorStripeAccountId,
        }),
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
      { idempotencyKey: params.idempotencyKey },
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
    // A post moderation removed is shown to nobody, and sold to nobody.
    const post = await this.prisma.post.findUnique({
      where: { id: postId, ...LISTED_POST },
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
    if (!payout?.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    return this.createDestinationChargeCheckout({
      buyerId: userId,
      buyerEmail: buyer.email,
      priceCents: post.priceCents,
      productName: 'Post unlock',
      // Who pays sees the Profile, never the creator's email.
      description: `Unlock exclusive content from @${(post as any).profile.username}`,
      creatorStripeAccountId: payout.stripeConnectAccountId,
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
    // A story moderation removed is shown to nobody, and sold to nobody.
    const story = await this.prisma.story.findUnique({
      where: { id: storyId, ...NOT_REMOVED },
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
    if (!payout?.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    return this.createDestinationChargeCheckout({
      buyerId: userId,
      buyerEmail: buyer.email,
      priceCents: story.priceCents,
      productName: 'Story unlock',
      description: `Unlock exclusive story from @${(story as any).profile.username}`,
      creatorStripeAccountId: payout.stripeConnectAccountId,
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

  async createMessageUnlockSession(
    userId: string,
    messageId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const message = (await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { sender: { include: { user: true } } },
    })) as any;

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
    // Defense-in-depth: the price should already be bounded at message
    // creation time (send-message.use-case.ts), but never trust a stored
    // price to build a Checkout Session without re-checking the range.
    if (
      message.priceCents < MIN_PPV_PRICE_CENTS ||
      message.priceCents > MAX_PPV_PRICE_CENTS
    ) {
      throw AppException.BadRequest(
        ErrorCode.NOT_PREMIUM_OR_NO_PRICE,
        `El precio del mensaje debe estar entre €${(MIN_PPV_PRICE_CENTS / 100).toFixed(2)} y €${(MAX_PPV_PRICE_CENTS / 100).toFixed(2)}.`,
      );
    }
    // message.senderId is a Profile.id; userId here is a User.id (per the
    // unlock-message controller) — compare against the sender's User.id,
    // not the mismatched Profile.id, or this check never actually fires.
    if (message.sender.user?.id === userId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_BUY_OWN_CONTENT,
        'You cannot unlock your own message',
      );
    }

    const existing = await (this.prisma as any).messageUnlock.findUnique({
      where: { userId_messageId: { userId, messageId } },
    });
    if (existing) {
      throw AppException.BadRequest(
        ErrorCode.CONTENT_ALREADY_UNLOCKED,
        'Message already unlocked',
      );
    }

    // message.sender is a Profile; Stripe Connect fields (and the User.id
    // that Transaction.receiverId/Monetization.userId expect) live on User.
    const creator = message.sender.user;
    const payout = creator
      ? await payoutDestinationFor(this.prisma, {
          id: message.senderId,
          userId: creator.id,
        })
      : null;
    if (!creator || !payout?.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator has not setup their Stripe account',
      );
    }

    const buyer = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!buyer)
      throw AppException.NotFound(ErrorCode.BUYER_NOT_FOUND, 'Buyer not found');

    return this.createDestinationChargeCheckout({
      buyerId: userId,
      buyerEmail: buyer.email,
      priceCents: message.priceCents,
      productName: 'Locked Message Unlock',
      description: `Unlock exclusive message from @${message.sender.username}`,
      creatorStripeAccountId: payout.stripeConnectAccountId,
      metadata: {
        type: 'DIRECT_MESSAGE_UNLOCK',
        ...withdrawalConsentMetadata(),
        messageId,
        creatorId: creator.id,
      },
      returnUrl,
      idempotencyKey,
      expiresAt:
        Math.floor(Date.now() / 1000) + MESSAGE_CHECKOUT_LIFETIME_SECONDS,
    });
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
      // No tip for a post moderation removed: it is shown to nobody.
      const post = await this.prisma.post.findUnique({
        where: { id: postId, ...LISTED_POST },
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
    if (!payout?.stripeConnectAccountId) {
      throw AppException.BadRequest(
        ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        'Creator cannot receive tips yet (no Stripe account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender)
      throw AppException.NotFound(
        ErrorCode.SENDER_NOT_FOUND,
        'Sender not found',
      );

    return this.createDestinationChargeCheckout({
      buyerId: senderId,
      buyerEmail: sender.email,
      priceCents: amountCents,
      productName: 'Creator Tip',
      // Who pays sees the Profile they tip, never the creator's email.
      description: named ? `Tip for @${named.username}` : 'Creator Tip',
      creatorStripeAccountId: payout.stripeConnectAccountId,
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
      select: { id: true, accountType: true },
    });
    if (!profile || !canMonetize(profile.accountType)) {
      throw AppException.Forbidden(
        ErrorCode.ACCOUNT_TYPE_NOT_ELIGIBLE_FOR_MONETIZATION,
        'Solo las cuentas Creator o Business pueden habilitar el cobro con Stripe.',
      );
    }

    try {
      const accountId = await this.payoutAccountToOnboard(user, profile.id);
      const link = await this.stripeService.createAccountLink(
        accountId,
        returnUrl,
        refreshUrl,
      );
      return { url: link.url };
    } catch (error: unknown) {
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
   * The account a Profile connects: its own; else the person's first, when
   * no other Profile holds it; else a new one for this Profile only, so two
   * Profiles never share balances, payouts or disputes.
   */
  private async payoutAccountToOnboard(
    user: { id: string; email: string; stripeConnectAccountId: string | null },
    profileId: string,
  ): Promise<string> {
    const own = await this.prisma.monetization.findUnique({
      where: { profileId },
      select: { stripeConnectAccountId: true },
    });
    if (own?.stripeConnectAccountId) return own.stripeConnectAccountId;

    // The person's own column too: a row missing for any reason must never
    // open a second first account at the provider.
    const person = await this.prisma.monetization.findUnique({
      where: { userId: user.id },
      select: { profileId: true, stripeConnectAccountId: true },
    });
    let first = person?.stripeConnectAccountId ?? user.stripeConnectAccountId;
    if (!first) {
      const account = await this.stripeService.createExpressAccount(
        user.email,
        `connect-account-${user.id}`,
      );
      first = account.id;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { stripeConnectAccountId: first },
      });
    }

    // The person's first account, kept on their row (a write of the row that
    // failed once is made again here), with the Profile holding it: the one
    // connecting, unless another Profile holds it already. A row with no
    // account yet holds nothing, whichever Profile it was opened from.
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

  async getIncomeStats(userId: string) {
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
        status: 'COMPLETED',
        type: {
          in: [
            'DIRECT_POST_UNLOCK',
            'DIRECT_STORY_UNLOCK',
            'DIRECT_MESSAGE_UNLOCK',
            'DIRECT_TIP',
            'DIRECT_LIVE_GIFT',
          ],
        },
        createdAt: {
          gte: sixMonthsAgo,
        },
      },
      select: {
        amount: true,
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
        months.set(key, months.get(key)! + tx.amount);
      }
    }

    return Array.from(months.entries()).map(([month, income]) => ({
      month,
      income,
    }));
  }

  async getFinancialSummary(userId: string) {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const [currentMonthTx, allTimeTipsTx, categoryBreakdown] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: {
            receiverId: userId,
            status: 'COMPLETED',
            type: {
              in: [
                'DIRECT_POST_UNLOCK',
                'DIRECT_STORY_UNLOCK',
                'DIRECT_MESSAGE_UNLOCK',
                'DIRECT_TIP',
                'DIRECT_LIVE_GIFT',
              ],
            },
            createdAt: {
              gte: currentMonth,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.transaction.aggregate({
          where: {
            receiverId: userId,
            status: 'COMPLETED',
            type: 'DIRECT_TIP',
          },
          _sum: {
            amount: true,
          },
        }),
        this.prisma.transaction.groupBy({
          by: ['type'],
          where: {
            receiverId: userId,
            status: 'COMPLETED',
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

    const breakdownMap: Record<string, number> = {
      DIRECT_POST_UNLOCK: 0,
      DIRECT_STORY_UNLOCK: 0,
      DIRECT_MESSAGE_UNLOCK: 0,
      DIRECT_TIP: 0,
      DIRECT_LIVE_GIFT: 0,
    };

    for (const item of categoryBreakdown) {
      if (item.type in breakdownMap) {
        breakdownMap[item.type] = item._sum.amount || 0;
      }
    }

    return {
      currentMonthIncome: currentMonthTx._sum.amount || 0,
      totalTips: allTimeTipsTx._sum.amount || 0,
      breakdown: {
        postUnlocks: breakdownMap.DIRECT_POST_UNLOCK,
        storyUnlocks: breakdownMap.DIRECT_STORY_UNLOCK,
        messageUnlocks: breakdownMap.DIRECT_MESSAGE_UNLOCK,
        tips: breakdownMap.DIRECT_TIP,
        liveGifts: breakdownMap.DIRECT_LIVE_GIFT,
      },
    };
  }
}
