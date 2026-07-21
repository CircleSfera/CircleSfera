import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SeoService } from './seo.service.js';

describe('SeoService', () => {
  let service: SeoService;

  const mockPrismaService = {
    profile: {
      findMany: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeoService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SeoService>(SeoService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSitemap', () => {
    it('should generate valid XML sitemap with profiles and posts', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([
        { username: 'testuser', updatedAt: new Date('2026-01-01') },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: 'post-1', createdAt: new Date('2026-01-02') },
      ]);

      const xml = await service.generateSitemap();
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<loc>https://circlesfera.com/testuser</loc>');
      expect(xml).toContain('<loc>https://circlesfera.com/p/post-1</loc>');
    });
  });

  describe('generateRobotsTxt', () => {
    it('should generate valid robots.txt string', () => {
      const robots = service.generateRobotsTxt();
      expect(robots).toContain('User-agent: *');
      expect(robots).toContain('Sitemap: https://circlesfera.com/api/v1/sitemap.xml');
    });
  });

  describe('generateOpenGraphHtml', () => {
    it('should generate fallback meta tags for home route', async () => {
      const html = await service.generateOpenGraphHtml('/');
      expect(html).toContain('<title>CircleSfera - The Next-Gen Social Network</title>');
      expect(html).toContain('og:image');
    });
  });
});
