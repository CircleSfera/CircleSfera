import { Logger } from '@nestjs/common';
import pg from 'pg';
import { afterAll, beforeAll, vi } from 'vitest';
import '../src/auth/passkey/disable-experimental-webcrypto-pqc.js';

// Silence NestJS chatty log levels to keep the e2e output readable.
// `error` is intentionally left untouched: in e2e runs it is only emitted by
// AllExceptionsFilter for genuinely unexpected failures, which is precisely the
// context needed to diagnose a failing run.
vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
vi.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});

// A spec fails when a `pg` client was sent a query while it was still
// running another one on the same connection: `pg` queues it today and
// rejects it in its next major version. Every query is checked against the
// client's own state, so the check does not depend on Node printing the
// deprecation (it prints it once per process, and not at all under
// --no-deprecation).
type BusyAwareClient = {
  _getActiveQuery?: () => unknown;
  _queryQueue?: unknown[];
};
type QueryArg = string | { text?: string } | undefined;

// Whether the client is running or holding a query. It reads fields of
// `pg` that are not part of its public API: the check below proves they
// still mean this, so that a rename fails loudly instead of letting every
// spec pass unchecked.
function isBusy(client: BusyAwareClient): boolean {
  return (
    client._getActiveQuery?.() != null || (client._queryQueue?.length ?? 0) > 0
  );
}

const originalQuery = pg.Client.prototype.query;
const queriesWhileBusy: string[] = [];
pg.Client.prototype.query = function (
  this: BusyAwareClient,
  ...args: unknown[]
) {
  if (isBusy(this)) {
    const first = args[0] as QueryArg;
    const sql = typeof first === 'string' ? first : first?.text;
    queriesWhileBusy.push(
      `${sql ?? '(no SQL text)'}\n${new Error('sent while busy').stack ?? ''}`,
    );
  }
  return (originalQuery as (...a: unknown[]) => unknown).apply(this, args);
} as typeof originalQuery;

// Proves the check against the installed `pg`, on a real connection: idle
// before, busy while a query runs, idle after. It never sends a second query
// meanwhile, so it does not itself do what it guards against.
beforeAll(async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const idleBefore = !isBusy(client as BusyAwareClient);
    const running = (
      originalQuery as (this: pg.Client, sql: string) => Promise<unknown>
    ).call(client, 'SELECT pg_sleep(0.05)');
    const busyDuring = isBusy(client as BusyAwareClient);
    await running;
    const idleAfter = !isBusy(client as BusyAwareClient);
    if (!(idleBefore && busyDuring && idleAfter)) {
      throw new Error(
        'The check for queries sent to a busy database connection no longer ' +
          "works with the installed pg: it reads pg's _getActiveQuery and " +
          '_queryQueue, which this version changed. Update isBusy in ' +
          'test/setup.e2e.ts.',
      );
    }
  } finally {
    await client.end();
  }
});

afterAll(() => {
  pg.Client.prototype.query = originalQuery;
  if (queriesWhileBusy.length > 0) {
    throw new Error(
      `${queriesWhileBusy.length} query(ies) sent to a database connection ` +
        'while it was running another one. Run the queries of a transaction ' +
        `one after another. First one:\n${queriesWhileBusy[0]}`,
    );
  }
});
