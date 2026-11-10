import { describe, expect, it } from 'vitest';
import {
  hasOwnStaffPassword,
  UNUSED_STAFF_PASSWORD_HASH,
} from './staff-password.constants.js';

describe('staff password constants', () => {
  it('tells an own password by when it was set, never by the stored hash', () => {
    expect(hasOwnStaffPassword({ passwordSetAt: new Date() })).toBe(true);
    expect(hasOwnStaffPassword({ passwordSetAt: null })).toBe(false);
    expect(hasOwnStaffPassword({})).toBe(false);
    // An old staff hash from before staff had their own is not one.
    expect(
      hasOwnStaffPassword({
        passwordSetAt: null,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$old$hash',
      } as never),
    ).toBe(false);
  });

  it('keeps a placeholder that is no password hash anyone can match', () => {
    expect(UNUSED_STAFF_PASSWORD_HASH).toContain('placeholder');
  });
});
