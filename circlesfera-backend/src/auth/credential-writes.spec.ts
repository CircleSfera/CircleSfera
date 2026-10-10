import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Credentials are written on the sign-in. The one exception is signing up,
// which creates the account with the columns it still requires; the database
// creates the sign-in from them.
const CREDENTIALS = [
  'password',
  'emailVerified',
  'verificationToken',
  'resetToken',
  'resetTokenExpires',
  'passwordResetRequiredAt',
  'isTwoFactorEnabled',
  'twoFactorSecret',
];

const SOURCES = [
  'auth.service.ts',
  'two-factor/two-factor.service.ts',
  'passkey/passkey.service.ts',
];

describe('credential writes', () => {
  it.each(SOURCES)('%s updates no credential on the account', (file) => {
    const source = readFileSync(join(import.meta.dirname, file), 'utf8');
    // Every `user.update({ ... })` call, up to the end of its argument.
    const updates = source.split(/\.user\s*\.update\(/).slice(1);

    for (const update of updates) {
      const call = update.slice(0, update.indexOf('});') + 3);
      for (const field of CREDENTIALS) {
        expect(call, `user.update writes ${field}`).not.toMatch(
          new RegExp(`\\b${field}\\s*[:,]`),
        );
      }
    }
  });
});
