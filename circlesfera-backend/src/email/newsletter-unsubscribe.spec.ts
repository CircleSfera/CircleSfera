import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { NewsletterUnsubscribe } from './newsletter-unsubscribe.js';

const withSecret = (secret: string | undefined) =>
  new NewsletterUnsubscribe({
    get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
  } as unknown as ConfigService);

describe('NewsletterUnsubscribe', () => {
  const tokens = withSecret('a-long-server-secret');

  it('a token names the account it was made for', () => {
    expect(tokens.verify(tokens.tokenFor('user-1'))).toBe('user-1');
  });

  it('refuses a token changed to name another account', () => {
    const [, signature] = tokens.tokenFor('user-1').split('.');
    const forged = `${Buffer.from('user-2').toString('base64url')}.${signature}`;

    expect(tokens.verify(forged)).toBeNull();
  });

  it('refuses a token signed with another secret', () => {
    expect(tokens.verify(withSecret('other').tokenFor('user-1'))).toBeNull();
  });

  it('refuses anything that is not a token', () => {
    for (const value of [
      undefined,
      null,
      42,
      '',
      'abc',
      'a.b.c',
      '.x',
      `x.${'y'.repeat(300)}`,
    ]) {
      expect(tokens.verify(value)).toBeNull();
    }
  });

  it('without a server secret no token is made or accepted', () => {
    const none = withSecret(undefined);

    expect(() => none.tokenFor('user-1')).toThrow();
    expect(none.verify(tokens.tokenFor('user-1'))).toBeNull();
  });
});
