import { describe, expect, it, vi } from 'vitest';
import { getBlurFallbackUrl, sanitizeUrl } from './apiUtils';

// Stub VITE_API_URL env variable
vi.stubEnv('VITE_API_URL', 'http://localhost:3000/api/v1');

describe('apiUtils', () => {
  describe('sanitizeUrl', () => {
    it('should return undefined for null or empty input', () => {
      expect(sanitizeUrl(null)).toBeUndefined();
      expect(sanitizeUrl('')).toBeUndefined();
    });

    it('should prepend base URL to relative /uploads paths', () => {
      const input = '/uploads/avatar.webp';
      const expected = 'http://localhost:3000/uploads/avatar.webp';
      expect(sanitizeUrl(input)).toBe(expected);
    });

    it('should normalize legacy localhost:3000 URLs', () => {
      const input = 'http://localhost:3000/uploads/avatar.webp';
      const expected = 'http://localhost:3000/uploads/avatar.webp';
      expect(sanitizeUrl(input)).toBe(expected);
    });

    it('should leave absolute external URLs untouched', () => {
      const input =
        'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg';
      expect(sanitizeUrl(input)).toBe(input);
    });
  });
});

describe('getBlurFallbackUrl host check', () => {
  it('transforms Cloudinary delivery URLs', () => {
    expect(
      getBlurFallbackUrl(
        'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      ),
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_10,e_blur:1000,q_1,f_auto/sample.jpg',
    );
  });

  it.each([
    'https://evil.example/res.cloudinary.com/upload/x.jpg',
    'https://res.cloudinary.com.evil.example/upload/x.jpg',
    'not a url res.cloudinary.com',
  ])('ignores %s', (url) => {
    expect(getBlurFallbackUrl(url)).toBeUndefined();
  });
});
