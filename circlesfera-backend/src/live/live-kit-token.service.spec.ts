import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JOIN_TOKEN_TTL_SECONDS,
  LiveKitTokenService,
} from './live-kit-token.service.js';

describe('LiveKitTokenService', () => {
  let service: LiveKitTokenService;

  const mockConfigService = {
    get: vi.fn((key: string): string | null => {
      if (key === 'LIVEKIT_API_KEY') return 'test_key';
      if (key === 'LIVEKIT_API_SECRET')
        return 'test_secret_32_bytes_long_key_mock_secret!';
      if (key === 'NODE_ENV') return 'test';
      return null;
    }),
  };

  beforeEach(() => {
    service = new LiveKitTokenService(
      mockConfigService as unknown as ConfigService,
    );
  });

  it('returns a JWT string for a publisher (host)', async () => {
    const token = await service.createToken('room-1', 'user-1', true);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('returns a JWT string for a subscriber (viewer)', async () => {
    const token = await service.createToken('room-1', 'user-2', false);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('gives every token a short life for joining, not the 6 hours of the library', async () => {
    const before = Math.floor(Date.now() / 1000);
    for (const isHost of [true, false]) {
      const token = await service.createToken('room-1', 'user-1', isHost);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as { exp: number; nbf: number };
      expect(JOIN_TOKEN_TTL_SECONDS).toBe(300);
      expect(payload.exp - payload.nbf).toBe(JOIN_TOKEN_TTL_SECONDS);
      expect(payload.exp).toBeLessThanOrEqual(
        before + JOIN_TOKEN_TTL_SECONDS + 5,
      );
    }
  });

  it('falls back to dev keys outside production when unset', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      return null;
    });

    const token = await service.createToken('room-1', 'user-1', true);
    expect(typeof token).toBe('string');
  });

  it('throws in production when LiveKit keys are missing', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      return null;
    });

    await expect(service.createToken('room-1', 'user-1', true)).rejects.toThrow(
      /LIVEKIT_API_KEY/,
    );
  });
});
