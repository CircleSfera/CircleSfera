import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// Credentials and one-time tokens that no query returns by default. A read
// that really needs one opts in with `omit: { <field>: false }` (login, 2FA,
// passkey challenges); everything else, including any future `include: { user:
// true }`, can no longer leak them. Runtime only: the generated TS types still
// list these fields, so a new reader must opt in explicitly or it gets
// `undefined`.
export const USER_SECRET_OMIT = {
  password: true,
  twoFactorSecret: true,
  resetToken: true,
  verificationToken: true,
  currentChallenge: true,
} as const;

const clientOmit = { user: USER_SECRET_OMIT } as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(dbUrl: string) {
    const pool = new Pool({ connectionString: dbUrl });
    const adapter = new PrismaPg(pool);
    super({ adapter, omit: clientOmit });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
