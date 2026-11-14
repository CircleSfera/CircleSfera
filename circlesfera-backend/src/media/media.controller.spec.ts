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
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { createControllerApp } from '../common/testing/http-controller.js';
import { MediaController } from './media.controller.js';
import { MediaAuthService } from './media-auth.service.js';
import { MediaStaffViewerService } from './media-staff-viewer.service.js';

describe('MediaController (HTTP integration)', () => {
  let app: INestApplication;

  const mockMediaAuthService = {
    isAccessAllowed: vi.fn().mockResolvedValue(true),
  };
  const mockStaffViewer = { isContentStaff: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [MediaController],
      providers: [
        { provide: MediaAuthService, useValue: mockMediaAuthService },
        { provide: MediaStaffViewerService, useValue: mockStaffViewer },
      ],
      guards: [{ guard: JwtOptionalGuard, mode: 'optional' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authCheck', () => {
    it('returns 204 when access is allowed', async () => {
      mockMediaAuthService.isAccessAllowed.mockResolvedValueOnce(true);

      await request(app.getHttpServer())
        .get('/api/v1/media/auth-check')
        .set('x-original-uri', '/uploads/posts/img.jpg')
        .expect(204);

      expect(mockMediaAuthService.isAccessAllowed).toHaveBeenCalledWith(
        '/uploads/posts/img.jpg',
        null,
        null,
        expect.any(Function),
      );
    });

    it('answers no header as an empty path', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/media/auth-check')
        .expect(204);

      expect(mockMediaAuthService.isAccessAllowed).toHaveBeenCalledWith(
        '',
        null,
        null,
        expect.any(Function),
      );
    });

    it('asks whether the request is staff only through the check it hands over', async () => {
      mockStaffViewer.isContentStaff.mockResolvedValueOnce(true);
      mockMediaAuthService.isAccessAllowed.mockImplementationOnce(
        async (
          _uri: string,
          _user: string | null,
          _profile: string | null,
          isStaff: () => Promise<boolean>,
        ) => isStaff(),
      );

      await request(app.getHttpServer())
        .get('/api/v1/media/auth-check')
        .set('x-original-uri', '/uploads/removed.jpg')
        .expect(204);

      expect(mockStaffViewer.isContentStaff).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when access is denied', async () => {
      mockMediaAuthService.isAccessAllowed.mockResolvedValueOnce(false);

      await request(app.getHttpServer())
        .get('/api/v1/media/auth-check')
        .set('x-original-uri', '/uploads/private/doc.pdf')
        .expect(403);
    });

    it('serves no teaser of a post any more', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/media/teaser/media-1/master.m3u8')
        .expect(404);
    });
  });
});
