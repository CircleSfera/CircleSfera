import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

describe('PushController', () => {
  let controller: PushController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const mockConfig = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [
        { provide: PushService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfig },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PushController>(PushController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the configured VAPID public key', () => {
    mockConfig.get.mockReturnValue('test-vapid-public');

    expect(controller.getPublicKey()).toEqual({
      publicKey: 'test-vapid-public',
    });
    expect(mockConfig.get).toHaveBeenCalledWith('VAPID_PUBLIC_KEY');
  });

  it('subscribes as the caller userId', async () => {
    const dto = {
      endpoint: 'https://push.example/sub-1',
      keys: { p256dh: 'key-1', auth: 'auth-1' },
    };
    mockService.subscribe.mockResolvedValue({ ok: true });

    await controller.subscribe(mockUser, dto);

    expect(mockService.subscribe).toHaveBeenCalledWith('user-1', dto);
  });

  it('unsubscribes by endpoint without a userId', async () => {
    mockService.unsubscribe.mockResolvedValue({ ok: true });

    await controller.unsubscribe('https://push.example/sub-1');

    expect(mockService.unsubscribe).toHaveBeenCalledWith(
      'https://push.example/sub-1',
    );
  });
});
