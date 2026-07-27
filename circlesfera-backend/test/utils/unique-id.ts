import { randomBytes } from 'node:crypto';

/**
 * Build a per-spec suffix for e2e fixture emails and usernames.
 *
 * `Date.now()` is not safe here: spec files are loaded in separate workers and
 * can evaluate within the same millisecond, so two specs would share a suffix
 * and each other's fixture rows in the single CI database.
 *
 * Only characters accepted by the username rules ([a-zA-Z0-9._]) are used.
 */
export function uniqueSuffix(): string {
  return `${process.pid.toString(36)}${randomBytes(5).toString('hex')}`;
}
