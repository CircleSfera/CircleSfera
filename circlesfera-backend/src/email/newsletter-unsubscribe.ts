import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The token in the unsubscribe link of a newsletter: the account it was sent
 * to, signed, so that one click leaves the newsletter without signing in and
 * nobody can unsubscribe someone else. It does not expire: a newsletter kept
 * in a mailbox must still let its reader leave.
 */
@Injectable()
export class NewsletterUnsubscribe {
  private readonly key: Buffer | null;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET')?.trim();
    // A key of its own, made from the server secret, so a token of this
    // kind is never valid as anything else.
    this.key = secret
      ? createHmac('sha256', secret).update('newsletter-unsubscribe').digest()
      : null;
  }

  private signature(userId: string): string {
    if (!this.key) throw new Error('JWT_SECRET is not set');
    return createHmac('sha256', this.key).update(userId).digest('base64url');
  }

  tokenFor(userId: string): string {
    return `${Buffer.from(userId).toString('base64url')}.${this.signature(userId)}`;
  }

  /** The account a token was made for, or nothing when it is not genuine. */
  verify(token: unknown): string | null {
    if (!this.key || typeof token !== 'string' || token.length > 256) {
      return null;
    }
    const [encoded, signature, ...rest] = token.split('.');
    if (!encoded || !signature || rest.length > 0) return null;
    const userId = Buffer.from(encoded, 'base64url').toString('utf8');
    if (!userId) return null;
    const expected = Buffer.from(this.signature(userId));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }
    return userId;
  }
}
