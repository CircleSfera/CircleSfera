import { describe, expect, it } from 'vitest';
import {
  isStreamCoHost,
  isStreamHost,
  isStreamHostOrCoHost,
} from './live-authorization.js';

describe('live-authorization', () => {
  const stream = { hostId: 'host-1', coHostId: 'cohost-1' };

  describe('isStreamHost', () => {
    it('returns true for the host', () => {
      expect(isStreamHost(stream, 'host-1')).toBe(true);
    });

    it('returns false for the co-host', () => {
      expect(isStreamHost(stream, 'cohost-1')).toBe(false);
    });

    it('returns false for an unrelated profile', () => {
      expect(isStreamHost(stream, 'someone-else')).toBe(false);
    });
  });

  describe('isStreamCoHost', () => {
    it('returns true for the co-host', () => {
      expect(isStreamCoHost(stream, 'cohost-1')).toBe(true);
    });

    it('returns false for the host', () => {
      expect(isStreamCoHost(stream, 'host-1')).toBe(false);
    });

    it('returns false when the stream has no co-host', () => {
      expect(isStreamCoHost({ coHostId: null }, 'cohost-1')).toBe(false);
    });
  });

  describe('isStreamHostOrCoHost', () => {
    it('returns true for the host', () => {
      expect(isStreamHostOrCoHost(stream, 'host-1')).toBe(true);
    });

    it('returns true for the co-host', () => {
      expect(isStreamHostOrCoHost(stream, 'cohost-1')).toBe(true);
    });

    it('returns false for an unrelated profile', () => {
      expect(isStreamHostOrCoHost(stream, 'someone-else')).toBe(false);
    });

    it('returns false for an unrelated profile when there is no co-host', () => {
      expect(
        isStreamHostOrCoHost({ hostId: 'host-1', coHostId: null }, 'viewer'),
      ).toBe(false);
    });
  });
});
