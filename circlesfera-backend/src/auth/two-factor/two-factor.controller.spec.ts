import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../../common/testing/http-controller.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { TwoFactorController } from './two-factor.controller.js';
import { TwoFactorService } from './two-factor.service.js';

describe('TwoFactorController', () => {
  let app: INestApplication;

  const mockService = {
    generateTwoFactorAuthenticationSecret: vi.fn(),
    generateQrCodeDataURL: vi.fn(),
    turnOnTwoFactorAuthentication: vi.fn(),
    turnOffTwoFactorAuthentication: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [TwoFactorController],
      providers: [{ provide: TwoFactorService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects generate without a session', async () => {
    await request(app.getHttpServer()).post('/api/v1/2fa/generate').expect(401);
    expect(
      mockService.generateTwoFactorAuthenticationSecret,
    ).not.toHaveBeenCalled();
  });

  it('generates a QR payload for the caller userId and email', async () => {
    mockService.generateTwoFactorAuthenticationSecret.mockResolvedValue({
      otpauthUrl: 'otpauth://test',
    });
    mockService.generateQrCodeDataURL.mockResolvedValue(
      'data:image/png;base64,test',
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/2fa/generate')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({
      qrCodeDataUrl: 'data:image/png;base64,test',
    });
    expect(
      mockService.generateTwoFactorAuthenticationSecret,
    ).toHaveBeenCalledWith({
      id: TEST_USER.userId,
      email: TEST_USER.email,
    });
    expect(mockService.generateQrCodeDataURL).toHaveBeenCalledWith(
      'otpauth://test',
    );
  });

  it('rejects turn-on with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/2fa/turn-on')
      .set(BEARER)
      .send({
        twoFactorAuthenticationCode: '123456',
        userId: 'other-user',
      })
      .expect(400);

    expect(mockService.turnOnTwoFactorAuthentication).not.toHaveBeenCalled();
  });

  it('turns 2FA on as the caller userId and unwraps the code', async () => {
    mockService.turnOnTwoFactorAuthentication.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/2fa/turn-on')
      .set(BEARER)
      .send({ twoFactorAuthenticationCode: '123456' })
      .expect(200);

    expect(res.body).toEqual({
      message: '2FA has been turned on successfully',
    });
    expect(mockService.turnOnTwoFactorAuthentication).toHaveBeenCalledWith(
      TEST_USER.userId,
      '123456',
    );
  });

  it('turns 2FA off as the caller userId and unwraps the code', async () => {
    mockService.turnOffTwoFactorAuthentication.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/2fa/turn-off')
      .set(BEARER)
      .send({ twoFactorAuthenticationCode: '123456' })
      .expect(200);

    expect(res.body).toEqual({
      message: '2FA has been turned off successfully',
    });
    expect(mockService.turnOffTwoFactorAuthentication).toHaveBeenCalledWith(
      TEST_USER.userId,
      '123456',
    );
  });
});
