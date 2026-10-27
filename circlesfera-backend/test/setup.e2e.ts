import { Logger } from '@nestjs/common';
import pg from 'pg';
import { afterAll, vi } from 'vitest';
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

const originalQuery = pg.Client.prototype.query;
const queriesWhileBusy: string[] = [];
pg.Client.prototype.query = function (
  this: BusyAwareClient,
  ...args: unknown[]
) {
  const busy =
    this._getActiveQuery?.() != null || (this._queryQueue?.length ?? 0) > 0;
  if (busy) {
    const first = args[0] as QueryArg;
    const sql = typeof first === 'string' ? first : first?.text;
    queriesWhileBusy.push(
      `${sql ?? '(no SQL text)'}\n${new Error('sent while busy').stack ?? ''}`,
    );
  }
  return (originalQuery as (...a: unknown[]) => unknown).apply(this, args);
} as typeof originalQuery;

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
