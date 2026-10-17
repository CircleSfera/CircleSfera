import { describe, expect, it } from 'vitest';
import { isOwnHost } from './sentryHost';

describe('isOwnHost', () => {
  it('reports from the app and its subdomains, the native apps and local stands', () => {
    for (const host of [
      'circlesfera.com',
      'www.circlesfera.com',
      'staging.circlesfera.com',
      'localhost',
      '127.0.0.1',
    ]) {
      expect(isOwnHost(host)).toBe(true);
    }
  });

  it('not from a copy of the site on another domain', () => {
    for (const host of [
      'codeqlick.com',
      'circlesfera.com.evil.example',
      'notcirclesfera.com',
    ]) {
      expect(isOwnHost(host)).toBe(false);
    }
  });
});
