import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
import { SerialTransactionPrismaPg } from './serial-transaction-adapter.js';

const { Pool } = pkg;

// Columns of the account that no query returns by default. A read that
// really needs one opts in with `omit: { <field>: false }`; everything else,
// including any future `include: { user: true }`, can no longer leak them.
// Runtime only: the generated TS types still list these fields, so a new
// reader must opt in explicitly or it gets `undefined`.
// The account holds no credentials; only its passkey challenge
// is left out.
export const USER_SECRET_OMIT = {
  currentChallenge: true,
} as const;

// The same rule for the sign-in, which holds the credentials.
export const SIGN_IN_SECRET_OMIT = {
  password: true,
  twoFactorSecret: true,
  resetToken: true,
  verificationToken: true,
} as const;

// What a member of a chat chose for themselves (muted, pinned). Every read of
// a chat lists its members, and nobody else may learn these; the readers
// that need them select them by name, for the member's own row.
export const PARTICIPANT_PRIVATE_OMIT = {
  mutedUntil: true,
  pinnedAt: true,
} as const;

// Columns of the former sale of content and of payments to creators. No
// query names them: they are dropped in the next release, and this release
// must keep working on the database after that drop if a deploy rolls back.
export const RETIRED_COLUMNS_OMIT = {
  user: { payoutsHeldAt: true },
  profile: {
    monetizationStatus: true,
    monetizationAppliedAt: true,
    monetizationPitch: true,
    monetizationReviewedAt: true,
    monetizationReviewedBy: true,
    monetizationNote: true,
  },
  post: { isPremium: true, priceCents: true },
  story: { isPremium: true, priceCents: true },
  message: { isLocked: true, priceCents: true },
  transaction: {
    receiverId: true,
    receiverProfileId: true,
    postId: true,
    storyId: true,
    messageId: true,
    liveStreamId: true,
  },
} as const;

const clientOmit = {
  user: { ...USER_SECRET_OMIT, ...RETIRED_COLUMNS_OMIT.user },
  signIn: SIGN_IN_SECRET_OMIT,
  participant: PARTICIPANT_PRIVATE_OMIT,
  profile: RETIRED_COLUMNS_OMIT.profile,
  post: RETIRED_COLUMNS_OMIT.post,
  story: RETIRED_COLUMNS_OMIT.story,
  message: RETIRED_COLUMNS_OMIT.message,
  transaction: RETIRED_COLUMNS_OMIT.transaction,
} as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(dbUrl: string) {
    const pool = new Pool({ connectionString: dbUrl });
    // Each transaction runs its queries one after another on its connection.
    const adapter = new SerialTransactionPrismaPg(pool);
    super({ adapter, omit: clientOmit });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
