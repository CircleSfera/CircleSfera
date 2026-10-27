import { Logger } from '@nestjs/common';
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

// A spec fails when the `pg` client was sent a query while it was still
// running another one on the same connection. `pg` only warns about it today
// and rejects it in its next major version. Only this warning fails a spec:
// other deprecations of the dependencies are left as warnings. Node prints a
// deprecation once per process, and each spec file runs in its own process.
const QUERY_WHILE_BUSY =
  'Calling client.query() when the client is already executing a query';
const queriesWhileBusy: Error[] = [];
process.on('warning', (warning) => {
  if (
    warning.name === 'DeprecationWarning' &&
    warning.message.startsWith(QUERY_WHILE_BUSY)
  ) {
    queriesWhileBusy.push(warning);
  }
});
afterAll(() => {
  if (queriesWhileBusy.length > 0) {
    throw new Error(
      `A database connection was sent a query while it was running another one. ` +
        `Run the queries of a transaction one after another.\n${queriesWhileBusy[0].stack}`,
    );
  }
});
