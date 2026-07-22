import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SeoService } from './seo.service.js';

describe('SeoService', () => {
  let service: SeoService;

  const mockPrismaService = {
    profile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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

  describe('generatePostOgImage & generateProfileOgImage', () => {
    it('should generate SVG card for post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello World',
        user: { profile: { username: 'creator', fullName: 'Creator User' }, verificationLevel: 'VERIFIED' },
        _count: { likes: 10, comments: 2 },
      });

      const svg = await service.generatePostOgImage('post-1');
      expect(svg).toContain('<svg');
      expect(svg).toContain('Creator User');
      expect(svg).toContain('10 Likes');
      expect(svg).toContain('CircleSfera');
    });

    it('should generate SVG card for profile', async () => {
      mockPrismaService.profile.findFirst = vi.fn().mockResolvedValueOnce({
        username: 'procreator',
        fullName: 'Pro Creator',
        bio: 'Official CircleSfera Account',
        user: { _count: { followers: 1250, following: 100, posts: 45 } },
      });

      const svg = await service.generateProfileOgImage('procreator');
      expect(svg).toContain('<svg');
      expect(svg).toContain('Pro Creator');
      expect(svg).toContain('1250 Followers');
      expect(svg).toContain('CircleSfera');
    });
  });
});
