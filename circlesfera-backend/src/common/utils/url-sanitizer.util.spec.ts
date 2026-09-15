import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from './url-sanitizer.util.js';

describe('url-sanitizer.util', () => {
  it('returns untouched URL if no query string is present', () => {
    expect(sanitizeUrl('/api/v1/posts')).toBe('/api/v1/posts');
    expect(sanitizeUrl('https://example.com/api/v1/users/me')).toBe(
      'https://example.com/api/v1/users/me',
    );
  });

  it('preserves non-sensitive query parameters', () => {
    const url = '/api/v1/posts?page=1&limit=20&sort=desc';
    const sanitized = sanitizeUrl(url);
    expect(sanitized).toBe('/api/v1/posts?page=1&limit=20&sort=desc');
  });

  it('redacts tokens and secrets in query parameters', () => {
    const url =
      '/api/v1/users/gdpr/exports/exp-123/download?token=secret-jwt-token-value&format=json';
    const sanitized = sanitizeUrl(url);
    expect(sanitized).toContain('token=%5BREDACTED%5D');
    expect(sanitized).toContain('format=json');
    expect(sanitized).not.toContain('secret-jwt-token-value');
  });

  it('redacts multiple sensitive parameters regardless of casing', () => {
    const url =
      '/api/v1/auth/callback?code=oauth-auth-code&apiKey=my-secret-key&Password=plaintext';
    const sanitized = sanitizeUrl(url);
    expect(sanitized).toContain('code=%5BREDACTED%5D');
    expect(sanitized).toContain('apiKey=%5BREDACTED%5D');
    expect(sanitized).toContain('Password=%5BREDACTED%5D');
    expect(sanitized).not.toContain('oauth-auth-code');
    expect(sanitized).not.toContain('my-secret-key');
    expect(sanitized).not.toContain('plaintext');
  });

  it('handles empty query strings or empty strings safely', () => {
    expect(sanitizeUrl('')).toBe('');
    expect(sanitizeUrl('/api/v1/posts?')).toBe('/api/v1/posts');
    expect(sanitizeUrl(null as any)).toBe(null);
    expect(sanitizeUrl(undefined as any)).toBe(undefined);
  });
});
