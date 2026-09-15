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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
} from '../common/testing/http-controller.js';
import { WebrtcController } from './webrtc.controller.js';
import { WebrtcService } from './webrtc.service.js';

describe('WebrtcController', () => {
  let app: INestApplication;

  const mockService = {
    getIceServers: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [WebrtcController],
      providers: [{ provide: WebrtcService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects ice servers without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/webrtc/ice-servers')
      .expect(401);

    expect(mockService.getIceServers).not.toHaveBeenCalled();
  });

  it('returns ice servers for a session', async () => {
    const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    mockService.getIceServers.mockResolvedValue(iceServers);

    const res = await request(app.getHttpServer())
      .get('/api/v1/webrtc/ice-servers')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(iceServers);
    expect(mockService.getIceServers).toHaveBeenCalledWith();
  });
});
