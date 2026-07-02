import { describe, expect, it, vi } from 'vitest';
import { sanitizeUrl } from './apiUtils';

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
