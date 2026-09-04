import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TwoFactorController } from './two-factor.controller.js';
import { TwoFactorService } from './two-factor.service.js';

describe('TwoFactorController', () => {
  let controller: TwoFactorController;

  const req = {
    user: {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'USER',
    },
  };

  const mockService = {
    generateTwoFactorAuthenticationSecret: vi.fn(),
    generateQrCodeDataURL: vi.fn(),
    turnOnTwoFactorAuthentication: vi.fn(),
    turnOffTwoFactorAuthentication: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TwoFactorController],
      providers: [{ provide: TwoFactorService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TwoFactorController>(TwoFactorController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('generates a QR payload for the caller userId and email', async () => {
    const res = { json: vi.fn() } as unknown as Response;
    mockService.generateTwoFactorAuthenticationSecret.mockResolvedValue({
      otpauthUrl: 'otpauth://test',
    });
    mockService.generateQrCodeDataURL.mockResolvedValue(
      'data:image/png;base64,test',
    );

    await controller.generate(req, res);

    expect(
      mockService.generateTwoFactorAuthenticationSecret,
    ).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'test@example.com',
    });
    expect(mockService.generateQrCodeDataURL).toHaveBeenCalledWith(
      'otpauth://test',
    );
    expect(res.json).toHaveBeenCalledWith({
      qrCodeDataUrl: 'data:image/png;base64,test',
    });
  });

  it('turns 2FA on as the caller userId and unwraps the code', async () => {
    mockService.turnOnTwoFactorAuthentication.mockResolvedValue(undefined);

    const result = await controller.turnOn(req, {
      twoFactorAuthenticationCode: '123456',
    });

    expect(mockService.turnOnTwoFactorAuthentication).toHaveBeenCalledWith(
      'user-1',
      '123456',
    );
    expect(result).toEqual({ message: '2FA has been turned on successfully' });
  });

  it('turns 2FA off as the caller userId and unwraps the code', async () => {
    mockService.turnOffTwoFactorAuthentication.mockResolvedValue(undefined);

    const result = await controller.turnOff(req, {
      twoFactorAuthenticationCode: '123456',
    });

    expect(mockService.turnOffTwoFactorAuthentication).toHaveBeenCalledWith(
      'user-1',
      '123456',
    );
    expect(result).toEqual({ message: '2FA has been turned off successfully' });
  });
});
