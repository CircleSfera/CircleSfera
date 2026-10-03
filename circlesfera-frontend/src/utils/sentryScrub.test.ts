import { describe, expect, it } from 'vitest';
import { scrubSentryPayload, scrubUrl } from './sentryScrub';

describe('scrubUrl', () => {
  it('redacts the token of a password reset link', () => {
    expect(
      scrubUrl('https://circlesfera.com/reset-password?token=abc123'),
    ).toBe('https://circlesfera.com/reset-password?token=[REDACTED]');
  });

  it('redacts relative URLs and keeps harmless parameters', () => {
    expect(scrubUrl('/verify-email?token=abc&tab=posts')).toBe(
      '/verify-email?token=[REDACTED]&tab=posts',
    );
  });

  it('redacts other credential-like parameters', () => {
    expect(
      scrubUrl('/x?access_token=1&inviteCode=2&session_id=3&q=hello'),
    ).toBe(
      '/x?access_token=[REDACTED]&inviteCode=[REDACTED]&session_id=[REDACTED]&q=hello',
    );
  });

  it('keeps the fragment and URLs without a query', () => {
    expect(scrubUrl('/p/1?token=a#comments')).toBe(
      '/p/1?token=[REDACTED]#comments',
    );
    expect(scrubUrl('/explore')).toBe('/explore');
  });
});

describe('scrubSentryPayload', () => {
  it('scrubs request URLs, transaction names and breadcrumb data', () => {
    const event = {
      transaction: '/reset-password?token=secret1',
      request: { url: 'https://circlesfera.com/verify-email?token=secret2' },
      breadcrumbs: [
        {
          category: 'navigation',
          data: { from: '/', to: '/reset-password?token=secret3' },
        },
      ],
      level: 'error',
    };

    const scrubbed = scrubSentryPayload(event);

    expect(JSON.stringify(scrubbed)).not.toMatch(/secret[123]/);
    expect(scrubbed.level).toBe('error');
    expect(scrubbed.breadcrumbs[0].data.from).toBe('/');
  });

  it('leaves non-string values untouched', () => {
    expect(scrubSentryPayload({ count: 3, ok: true, none: null })).toEqual({
      count: 3,
      ok: true,
      none: null,
    });
  });
});
