import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveKitTokenService } from './live-kit-token.service.js';

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
