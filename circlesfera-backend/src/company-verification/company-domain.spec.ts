import { describe, expect, it } from 'vitest';
import { isValidLocalPart, normalizeDomain } from './company-domain.js';

describe('company domain', () => {
  it.each([
    ['Example.com', 'example.com'],
    ['https://www.Example.es/contact?x=1#top', 'example.es'],
    ['shop.example.co.uk:443/', 'shop.example.co.uk'],
    ['example.com.', 'example.com'],
    ['xn--espaa-rta.es', 'xn--espaa-rta.es'],
  ])('%s is checked as %s', (raw, domain) => {
    expect(normalizeDomain(raw)).toBe(domain);
  });

  it.each([
    'localhost',
    '192.168.1.10',
    '10.0.0.1',
    'exa mple.com',
    '-example.com',
    'example',
    'a.b',
    'ftp://',
  ])('%s is not a public domain', (raw) => {
    expect(normalizeDomain(raw)).toBeNull();
  });

  it.each([
    ['info', true],
    ['first.last', true],
    ['sales+es', true],
    ['.info', false],
    ['info.', false],
    ['in fo', false],
    ['a@b', false],
    ['', false],
  ])('the address part %s is %s', (part, valid) => {
    expect(isValidLocalPart(part)).toBe(valid);
  });
});
