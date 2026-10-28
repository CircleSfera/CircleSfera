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
// The account holds no credentials (ADR-0025); only its passkey challenge
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

// A column about to be dropped: no query names it, so that the version
// before the drop keeps working once it is gone. A broadcast's recording
// jobs are kept per part (live_recording_parts) now.
export const LIVE_STREAM_RETIRED_OMIT = {
  egressId: true,
} as const;

const clientOmit = {
  user: USER_SECRET_OMIT,
  signIn: SIGN_IN_SECRET_OMIT,
  liveStream: LIVE_STREAM_RETIRED_OMIT,
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
