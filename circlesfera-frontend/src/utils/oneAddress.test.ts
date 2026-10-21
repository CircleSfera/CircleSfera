import { describe, expect, it, vi } from 'vitest';
import { moveToOneAddress, oneAddressFor } from './oneAddress';

const at = (hostname: string, pathname = '/', search = '', hash = '') => ({
  hostname,
  pathname,
  search,
  hash,
  replace: vi.fn(),
});

describe('oneAddressFor', () => {
  it('a page on www moves to the same place on circlesfera.com', () => {
    expect(
      oneAddressFor(at('www.circlesfera.com', '/ana', '?tab=reels', '#top')),
    ).toBe('https://circlesfera.com/ana?tab=reels#top');
  });

  it('every other address stays where it is', () => {
    for (const host of [
      'circlesfera.com',
      'staging.circlesfera.com',
      'admin.circlesfera.com',
      'localhost',
      'www.circlesfera.com.evil.example',
    ]) {
      expect(oneAddressFor(at(host, '/ana'))).toBeNull();
    }
  });
});

describe('moveToOneAddress', () => {
  it('replaces the page on www, so the back button does not return to it', () => {
    const location = at('www.circlesfera.com', '/explore');
    expect(moveToOneAddress(location)).toBe(true);
    expect(location.replace).toHaveBeenCalledWith(
      'https://circlesfera.com/explore',
    );
  });

  it('does nothing on circlesfera.com', () => {
    const location = at('circlesfera.com', '/explore');
    expect(moveToOneAddress(location)).toBe(false);
    expect(location.replace).not.toHaveBeenCalled();
  });
});
