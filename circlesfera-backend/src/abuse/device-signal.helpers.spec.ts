import { describe, expect, it } from 'vitest';
import {
  clientIp,
  countryFromHeaders,
  normalizeCountry,
  normalizeIp,
  requestAbuseMeta,
} from './device-signal.service.js';

describe('client IP and abuse request metadata', () => {
  it('uses the IP resolved from the trusted proxy chain, never X-Forwarded-For', () => {
    const req = {
      ip: '198.51.100.7',
      headers: { 'x-forwarded-for': '54.37.159.171, 198.51.100.7' },
    };

    expect(clientIp(req)).toBe('198.51.100.7');
    expect(requestAbuseMeta(req).ip).toBe('198.51.100.7');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(clientIp({ ip: '::ffff:203.0.113.9' })).toBe('203.0.113.9');
  });

  it('returns null for a missing or malformed IP', () => {
    expect(clientIp({ ip: undefined })).toBeNull();
    expect(clientIp({ ip: 'not-an-ip' })).toBeNull();
  });

  it('collects user agent, country and the bypass token header', () => {
    const meta = requestAbuseMeta({
      ip: '203.0.113.9',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'cf-ipcountry': 'es',
        'x-turnstile-bypass': 'secret-token',
      },
    });

    expect(meta).toEqual({
      ip: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
      country: 'ES',
      turnstileBypassToken: 'secret-token',
    });
  });

  it('ignores non-string header values', () => {
    const meta = requestAbuseMeta({
      ip: '203.0.113.9',
      headers: { 'user-agent': ['a', 'b'], 'x-turnstile-bypass': ['x'] },
    });

    expect(meta.userAgent).toBeNull();
    expect(meta.turnstileBypassToken).toBeNull();
  });

  it('validates IPv4 and IPv6 shapes', () => {
    expect(normalizeIp(' 10.0.0.1 ')).toBe('10.0.0.1');
    expect(normalizeIp('[2001:db8::1]')).toBe('2001:db8::1');
    expect(normalizeIp('300.1.1.1')).toBeNull();
    expect(normalizeIp('x'.repeat(46))).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });

  it('accepts only real two-letter country codes', () => {
    expect(normalizeCountry('fr')).toBe('FR');
    expect(normalizeCountry('XX')).toBeNull();
    expect(normalizeCountry('T1')).toBeNull();
    expect(normalizeCountry('ESP')).toBeNull();
    expect(countryFromHeaders({ 'cf-ipcountry': ['de'] })).toBe('DE');
    expect(countryFromHeaders({})).toBeNull();
  });
});
