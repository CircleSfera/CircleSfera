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
import { createControllerApp } from '../common/testing/http-controller.js';
import { SeoController } from './seo.controller.js';
import { SeoService } from './seo.service.js';

describe('SeoController', () => {
  let app: INestApplication;

  const mockService = {
    generateSitemap: vi.fn(),
    generateRobotsTxt: vi.fn(),
    generateOpenGraphHtml: vi.fn(),
    generatePostOgImage: vi.fn(),
    generateProfileOgImage: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SeoController],
      providers: [{ provide: SeoService, useValue: mockService }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates sitemap and robots.txt', async () => {
    mockService.generateSitemap.mockResolvedValue('<urlset/>');
    mockService.generateRobotsTxt.mockReturnValue('User-agent: *');

    const sitemap = await request(app.getHttpServer())
      .get('/api/v1/sitemap.xml')
      .expect(200);
    expect(sitemap.text).toBe('<urlset/>');

    const robots = await request(app.getHttpServer())
      .get('/api/v1/robots.txt')
      .expect(200);
    expect(robots.text).toBe('User-agent: *');

    expect(mockService.generateSitemap).toHaveBeenCalledWith();
    expect(mockService.generateRobotsTxt).toHaveBeenCalledWith();
  });

  it('generates Open Graph HTML with a path or the root fallback', async () => {
    mockService.generateOpenGraphHtml.mockResolvedValue('<html/>');

    await request(app.getHttpServer())
      .get('/api/v1/og')
      .query({ path: '/u/alice' })
      .expect(200);
    await request(app.getHttpServer()).get('/api/v1/og').expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/og')
      .query({ path: '' })
      .expect(200);

    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(
      1,
      '/u/alice',
    );
    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(2, '/');
    expect(mockService.generateOpenGraphHtml).toHaveBeenNthCalledWith(3, '/');
  });

  it('generates OG images by post id and username', async () => {
    mockService.generatePostOgImage.mockResolvedValue('<svg/>');
    mockService.generateProfileOgImage.mockResolvedValue('<svg/>');

    await request(app.getHttpServer())
      .get('/api/v1/og-image/post/post-1')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/og-image/profile/alice')
      .expect(200);

    expect(mockService.generatePostOgImage).toHaveBeenCalledWith('post-1');
    expect(mockService.generateProfileOgImage).toHaveBeenCalledWith('alice');
  });
});
