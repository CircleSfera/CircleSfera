import { describe, expect, it } from 'vitest';
import {
  domainSuffixes,
  isUnderBlocked,
  normaliseLink,
} from './link-safety.js';

describe('a link on a story', () => {
  it('is kept as https with its host written as the server writes it', () => {
    expect(normaliseLink(' https://Shop.Example.COM./a?b=1#c ')).toEqual({
      url: 'https://shop.example.com/a?b=1#c',
      domain: 'shop.example.com',
    });
    expect(normaliseLink('https://bücher.de').domain).toBe('xn--bcher-kva.de');
    expect(normaliseLink('https://example.org:443/x').url).toBe(
      'https://example.org/x',
    );
  });

  it.each([
    ['http://example.com', 'LINK_HTTPS_ONLY'],
    ['javascript:alert(1)', 'LINK_HTTPS_ONLY'],
    ['https://user:pw@example.com', 'LINK_INVALID'],
    ['https://example.com:8443', 'LINK_INVALID'],
    ['https://192.168.1.1', 'LINK_IP_NOT_ALLOWED'],
    ['https://[::1]/', 'LINK_IP_NOT_ALLOWED'],
    ['https://8.8.8.8', 'LINK_IP_NOT_ALLOWED'],
    ['https://intranet', 'LINK_HOST_NOT_ALLOWED'],
    ['https://printer.local', 'LINK_HOST_NOT_ALLOWED'],
    ['https://db.internal', 'LINK_HOST_NOT_ALLOWED'],
    ['https://router.home.arpa', 'LINK_HOST_NOT_ALLOWED'],
    ['not a link', 'LINK_INVALID'],
    [`https://example.com/${'a'.repeat(2048)}`, 'LINK_INVALID'],
    [42, 'LINK_INVALID'],
  ])('refuses %s', (raw, code) => {
    expect(() => normaliseLink(raw)).toThrow(code);
  });

  it('falls under a blocked domain and every domain it is under', () => {
    expect(domainSuffixes('a.b.example.com')).toEqual([
      'a.b.example.com',
      'b.example.com',
      'example.com',
    ]);
    const blocked = new Set(['example.com']);
    expect(isUnderBlocked('shop.example.com', blocked)).toBe(true);
    expect(isUnderBlocked('example.com', blocked)).toBe(true);
    expect(isUnderBlocked('notexample.com', blocked)).toBe(false);
  });
});
