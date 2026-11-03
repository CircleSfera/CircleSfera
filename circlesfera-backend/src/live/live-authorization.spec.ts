import { describe, expect, it } from 'vitest';
import {
  isStreamHost,
  isStreamHostOrOnAirGuest,
} from './live-authorization.js';

describe('live-authorization', () => {
  const stream = { hostId: 'host-1' };

  describe('isStreamHost', () => {
    it('returns true for the host', () => {
      expect(isStreamHost(stream, 'host-1')).toBe(true);
    });

    it('returns false for anyone else', () => {
      expect(isStreamHost(stream, 'someone-else')).toBe(false);
    });
  });

  describe('isStreamHostOrOnAirGuest', () => {
    it('lets the host act, whatever else', () => {
      expect(isStreamHostOrOnAirGuest(stream, 'host-1', undefined)).toBe(true);
    });

    it('lets a guest on air act', () => {
      expect(isStreamHostOrOnAirGuest(stream, 'guest', 'ON_AIR')).toBe(true);
    });

    it('keeps out a guest only invited, or out of the live, and anyone else', () => {
      for (const status of [
        'INVITED',
        'DECLINED',
        'LEFT',
        'REMOVED',
        null,
        undefined,
      ] as const) {
        expect(isStreamHostOrOnAirGuest(stream, 'guest', status)).toBe(false);
      }
    });
  });
});
