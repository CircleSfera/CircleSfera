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

// Columns of the account left in the database until a later release drops
// them. No query names them meanwhile, so the version running before the
// drop never reads or writes one that is gone. The payout account is kept on
// the payout rows (monetization), one per person or Profile.
export const USER_RETIRED_OMIT = {
  stripeConnectAccountId: true,
} as const;

// What a member of a chat chose for themselves (muted, pinned). Every read of
// a chat lists its members, and nobody else may learn these; the readers
// that need them select them by name, for the member's own row.
export const PARTICIPANT_PRIVATE_OMIT = {
  mutedUntil: true,
  pinnedAt: true,
} as const;

const clientOmit = {
  user: { ...USER_SECRET_OMIT, ...USER_RETIRED_OMIT },
  signIn: SIGN_IN_SECRET_OMIT,
  participant: PARTICIPANT_PRIVATE_OMIT,
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
