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
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

// The first bytes of what a browser records from the microphone: webm
// (Chrome, Firefox, Android) and mp4 (Safari).
const WEBM = Buffer.from(
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAABEq',
  'base64',
);
const MP4 = Buffer.from(
  'AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAAArxtb292AAAAbA==',
  'base64',
);

describe('UploadsController over HTTP', () => {
  let app: INestApplication;
  const mockService = { uploadFile: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockService.uploadFile.mockResolvedValue({
      url: '/uploads/voice.m4a',
      type: 'audio',
    });
  });

  it.each([
    ['webm', WEBM, 'voice-note.webm', 'audio/webm'],
    ['mp4', MP4, 'voice-note.m4a', 'audio/mp4'],
  ])(
    'takes a voice note recorded as %s, as the app sends it',
    async (_format, bytes, filename, contentType) => {
      await request(app.getHttpServer())
        .post('/api/v1/uploads')
        .set(BEARER)
        .attach('file', bytes, { filename, contentType })
        .expect(201);

      expect(mockService.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: contentType }),
        TEST_USER.userId,
        TEST_USER.profileId,
      );
    },
  );

  it('refuses a file that is not what it declares, before the service sees it', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .set(BEARER)
      .attach('file', Buffer.from('MZ not a recording at all'), {
        filename: 'voice-note.webm',
        contentType: 'audio/webm',
      })
      .expect(400);

    expect(mockService.uploadFile).not.toHaveBeenCalled();
  });

  it('asks for a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/uploads')
      .attach('file', WEBM, {
        filename: 'voice-note.webm',
        contentType: 'audio/webm',
      })
      .expect(401);
  });
});
