import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg, { type PoolConfig } from 'pg';

const { Pool } = pkg;

/**
 * How long a new connection to the database may take. Without it, pg waits
 * for ever on a database that drops packets, and so does every request that
 * needs one: the health check included, which then never answers 503.
 */
export const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

/** The pool settings of the Help Desk database. */
export function databasePoolConfig(
  dbUrl: string,
  connectTimeoutMs: number = DATABASE_CONNECT_TIMEOUT_MS,
): PoolConfig {
  return { connectionString: dbUrl, connectionTimeoutMillis: connectTimeoutMs };
}

/** The client of the Help Desk's own database, never CircleSfera's. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(dbUrl: string, connectTimeoutMs?: number) {
    const pool = new Pool(databasePoolConfig(dbUrl, connectTimeoutMs));
    super({ adapter: new PrismaPg(pool) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
