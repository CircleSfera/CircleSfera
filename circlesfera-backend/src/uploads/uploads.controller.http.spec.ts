import { type INestApplication, NotFoundException } from '@nestjs/common';
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
  TEST_UUID,
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
  const mockService = {
    uploadFile: vi.fn(),
    startFrameAssembly: vi.fn(),
    frameAssemblyStatus: vi.fn(),
  };

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
    mockService.startFrameAssembly.mockResolvedValue({ id: 'frame-job' });
    mockService.frameAssemblyStatus.mockResolvedValue({
      status: 'READY',
      url: '/uploads/frame.mp4',
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

  describe('a Frame put together from its clips', () => {
    const CLIP = { url: '/uploads/clip.mp4', startMs: 0, endMs: 20_000 };

    it('is asked for with its clips in order, for the Profile the person acts as', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/uploads/frames')
        .set(BEARER)
        .send({
          clips: [CLIP, { url: '/uploads/b.mp4', startMs: 500, endMs: 9000 }],
          layerUrl: '/uploads/layer.avif',
          muted: false,
        })
        .expect(202);

      expect(response.body).toEqual({ id: 'frame-job' });
      expect(mockService.startFrameAssembly).toHaveBeenCalledWith(
        { profileId: TEST_USER.profileId, userId: TEST_USER.userId },
        {
          clips: [CLIP, { url: '/uploads/b.mp4', startMs: 500, endMs: 9000 }],
          layerUrl: '/uploads/layer.avif',
          muted: false,
        },
      );
    });

    it.each([
      ['no clip', { clips: [] }],
      ['too many clips', { clips: Array.from({ length: 21 }, () => CLIP) }],
      ['a clip with no address', { clips: [{ startMs: 0, endMs: 20_000 }] }],
      ['a negative start', { clips: [{ ...CLIP, startMs: -1 }] }],
      ['a moment that is not a whole ms', { clips: [{ ...CLIP, endMs: 1.5 }] }],
      ['a muted that is not yes or no', { clips: [CLIP], muted: 'yes' }],
      ['a field it does not know', { clips: [CLIP], audioUrl: '/x.mp3' }],
    ])('refuses %s before the service sees it', async (_case, body) => {
      await request(app.getHttpServer())
        .post('/api/v1/uploads/frames')
        .set(BEARER)
        .send(body)
        .expect(400);

      expect(mockService.startFrameAssembly).not.toHaveBeenCalled();
    });

    it('answers where the Frame is, for the Profile the person acts as', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/uploads/frames/${TEST_UUID}`)
        .set(BEARER)
        .expect(200);

      expect(response.body).toEqual({
        status: 'READY',
        url: '/uploads/frame.mp4',
      });
      expect(mockService.frameAssemblyStatus).toHaveBeenCalledWith(
        TEST_USER.profileId,
        TEST_UUID,
      );
    });

    it('answers a job that is not the person’s as not found', async () => {
      mockService.frameAssemblyStatus.mockRejectedValueOnce(
        new NotFoundException('FRAME_ASSEMBLY_NOT_FOUND'),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/uploads/frames/${TEST_UUID}`)
        .set(BEARER)
        .expect(404);
    });

    it('refuses an id that is not one it gives', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/uploads/frames/transcode-abc')
        .set(BEARER)
        .expect(400);

      expect(mockService.frameAssemblyStatus).not.toHaveBeenCalled();
    });

    it('asks for a session', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/uploads/frames')
        .send({ clips: [CLIP] })
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/uploads/frames/${TEST_UUID}`)
        .expect(401);
    });
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
