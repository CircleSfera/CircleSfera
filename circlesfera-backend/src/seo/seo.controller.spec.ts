import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeoController } from './seo.controller.js';
import { SeoService } from './seo.service.js';

describe('SeoController', () => {
  let controller: SeoController;

  const mockService = {
    generateSitemap: vi.fn(),
    generateRobotsTxt: vi.fn(),
    generateOpenGraphHtml: vi.fn(),
    generatePostOgImage: vi.fn(),
    generateProfileOgImage: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeoController],
      providers: [{ provide: SeoService, useValue: mockService }],
    }).compile();

    controller = module.get<SeoController>(SeoController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates sitemap and robots.txt', async () => {
    mockService.generateSitemap.mockResolvedValue('<urlset/>');
    mockService.generateRobotsTxt.mockReturnValue('User-agent: *');

    await controller.getSitemap();
    controller.getRobotsTxt();

    expect(mockService.generateSitemap).toHaveBeenCalledWith();
    expect(mockService.generateRobotsTxt).toHaveBeenCalledWith();
  });

  it('generates Open Graph HTML with a path or the root fallback', async () => {
    mockService.generateOpenGraphHtml.mockResolvedValue('<html/>');

    await controller.getOpenGraphHtml('/u/alice');
    await controller.getOpenGraphHtml('');
    await controller.getOpenGraphHtml(undefined as never);

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

    await controller.getPostOgImage('post-1');
    await controller.getProfileOgImage('alice');

    expect(mockService.generatePostOgImage).toHaveBeenCalledWith('post-1');
    expect(mockService.generateProfileOgImage).toHaveBeenCalledWith('alice');
  });
});
