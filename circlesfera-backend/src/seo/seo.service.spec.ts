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
      findFirst: vi.fn(),
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

    it('only queries eligible public profiles and posts', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([]);
      mockPrismaService.post.findMany.mockResolvedValue([]);

      await service.generateSitemap();

      const profileWhere = mockPrismaService.profile.findMany.mock.calls[0][0]
        .where as Record<string, unknown>;
      expect(profileWhere).toEqual({
        user: {
          isActive: true,
          deactivatedAt: null,
          isRootBanned: false,
          settings: { isNot: { privacyLevel: 'PRIVATE' } },
        },
      });

      const postWhere = mockPrismaService.post.findMany.mock.calls[0][0]
        .where as Record<string, unknown>;
      expect(postWhere).toMatchObject({
        visibility: 'PUBLIC',
        isPremium: false,
        moderationStatus: 'VISIBLE',
        scheduledStatus: 'PUBLISHED',
        profile: profileWhere,
      });
    });
  });

  describe('generateRobotsTxt', () => {
    it('should generate valid robots.txt string', () => {
      const robots = service.generateRobotsTxt();
      expect(robots).toContain('User-agent: *');
      expect(robots).toContain(
        'Sitemap: https://circlesfera.com/api/v1/sitemap.xml',
      );
    });
  });

  describe('generateOpenGraphHtml', () => {
    it('should generate fallback meta tags for home route', async () => {
      const html = await service.generateOpenGraphHtml('/');
      expect(html).toContain(
        '<title>CircleSfera - The Next-Gen Social Network</title>',
      );
      expect(html).toContain('og:image');
    });

    it('should generate meta tags for post route', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'p-1',
        caption: 'Amazing post description',
        profile: { fullName: 'Alice', username: 'alice' },
      });

      const html = await service.generateOpenGraphHtml('/p/p-1');
      expect(html).toContain(
        'Alice on CircleSfera: &quot;Amazing post description...&quot;',
      );
      expect(html).toContain('/api/v1/og-image/post/p-1');
    });

    it('should generate meta tags for post route without caption or when post missing', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'p-2',
        caption: null,
        profile: { fullName: null, username: 'bob' },
      });

      const htmlWithNullCaption = await service.generateOpenGraphHtml('/p/p-2');
      expect(htmlWithNullCaption).toContain('Post by bob');

      mockPrismaService.post.findFirst.mockResolvedValueOnce(null);
      const htmlNullPost = await service.generateOpenGraphHtml('/p/p-missing');
      expect(htmlNullPost).toContain(
        '<title>CircleSfera - The Next-Gen Social Network</title>',
      );
    });

    it('should generate meta tags for profile route', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        username: 'bob',
        fullName: 'Bob Smith',
        bio: 'Tech enthusiast',
        _count: { followers: 50, following: 10 },
      });

      const html = await service.generateOpenGraphHtml('/bob');
      expect(html).toContain('Bob Smith (@bob) | CircleSfera');
      expect(html).toContain('Tech enthusiast');
      expect(html).toContain('/api/v1/og-image/profile/bob');
    });

    it('should generate meta tags for profile route without bio or when profile missing', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        username: 'charlie',
        fullName: 'Charlie',
        bio: null,
        _count: { followers: 10, following: 5 },
      });

      const htmlNoBio = await service.generateOpenGraphHtml('/charlie');
      expect(htmlNoBio).toContain(
        'Follow @charlie on CircleSfera. 10 Followers.',
      );

      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      const htmlNullProfile = await service.generateOpenGraphHtml('/notfound');
      expect(htmlNullProfile).toContain(
        '<title>CircleSfera - The Next-Gen Social Network</title>',
      );
    });

    it('filters posts and profiles by public eligibility', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce(null);
      await service.generateOpenGraphHtml('/p/p-private');
      expect(mockPrismaService.post.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({
          id: 'p-private',
          visibility: 'PUBLIC',
          isPremium: false,
          moderationStatus: 'VISIBLE',
          scheduledStatus: 'PUBLISHED',
        }),
      );

      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await service.generateOpenGraphHtml('/private-user');
      expect(
        mockPrismaService.profile.findFirst.mock.calls[0][0].where,
      ).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            isActive: true,
            deactivatedAt: null,
            isRootBanned: false,
          }),
        }),
      );
    });

    it('escapes user-controlled values in meta tags', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'p-xss',
        caption: '"><script>alert(1)</script> & more',
        profile: { fullName: '<b>Eve</b>', username: 'eve' },
      });

      const html = await service.generateOpenGraphHtml('/p/p-xss');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('<b>Eve</b>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&quot;&gt;');
      expect(html).toContain('&amp; more');
    });

    it('does not reflect a hostile path into markup or the redirect script', async () => {
      const html = await service.generateOpenGraphHtml(
        '/p/"</script><script>alert(1)</script>',
      );
      expect(html).not.toContain('</script><script>alert(1)');
      expect(html).toContain('\\u003c/script>');
    });

    it.each([
      '//evil.example',
      '@evil.example',
      'evil.example/path',
      'https://evil.example',
      '/a\\b',
      '/a\nb',
    ])('falls back to the home page for unsafe path %j', async (path) => {
      const html = await service.generateOpenGraphHtml(path);
      expect(html).toContain(
        'window.location.replace("https://circlesfera.com/")',
      );
      expect(html).not.toContain('evil.example');
    });

    it('should fall back gracefully on database error', async () => {
      mockPrismaService.post.findFirst.mockRejectedValueOnce(
        new Error('DB failure'),
      );

      const html = await service.generateOpenGraphHtml('/p/p-fail');
      expect(html).toContain(
        '<title>CircleSfera - The Next-Gen Social Network</title>',
      );
    });
  });

  describe('generatePostOgImage & generateProfileOgImage', () => {
    it('should generate SVG card for post with long caption', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'post-1',
        caption:
          'This is an extremely long post caption designed to test the truncation logic when the text exceeds ninety characters in length!',
        profile: {
          username: 'creator',
          fullName: 'Creator User',
          verificationLevel: 'VERIFIED',
          user: {},
        },
        _count: { likes: 10, comments: 2 },
      });

      const svg = await service.generatePostOgImage('post-1');
      expect(svg).toContain('<svg');
      expect(svg).toContain('Creator User');
      expect(svg).toContain('10 Likes');
      expect(svg).toContain('CircleSfera');
    });

    it('should generate SVG card for post when post is null', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce(null);

      const svg = await service.generatePostOgImage('post-none');
      expect(svg).toContain('<svg');
      expect(svg).toContain('CircleSfera User');
    });

    it('should generate SVG card for post with short caption and BASIC verification', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'post-short',
        caption: 'Short caption',
        profile: {
          username: 'basicuser',
          fullName: null,
          verificationLevel: 'BASIC',
          user: {},
        },
        _count: { likes: 0, comments: 0 },
      });

      const svg = await service.generatePostOgImage('post-short');
      expect(svg).toContain('<svg');
      expect(svg).toContain('basicuser');
      expect(svg).toContain('Short caption');
    });

    it('should generate SVG card for post with no caption', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'post-nocap',
        caption: null,
        profile: {
          username: 'nocap',
          fullName: 'No Cap User',
          verificationLevel: 'VERIFIED',
          user: {},
        },
        _count: null,
      });

      const svg = await service.generatePostOgImage('post-nocap');
      expect(svg).toContain('Visual content on CircleSfera');
      expect(svg).toContain('0 Likes');
    });

    it('should generate SVG card for profile with short bio and null bio', async () => {
      mockPrismaService.profile.findFirst = vi.fn().mockResolvedValueOnce({
        username: 'shortbio',
        fullName: null,
        bio: 'Just a short bio',
        _count: null,
        user: {},
      });

      const svgShort = await service.generateProfileOgImage('shortbio');
      expect(svgShort).toContain('Just a short bio');
      expect(svgShort).toContain('0 Followers');

      mockPrismaService.profile.findFirst = vi.fn().mockResolvedValueOnce({
        username: 'nobio',
        fullName: 'No Bio User',
        bio: null,
        _count: { followers: 5, following: 3, posts: 1 },
        user: {},
      });

      const svgNoBio = await service.generateProfileOgImage('nobio');
      expect(svgNoBio).toContain('Explore @nobio profile on CircleSfera.');
    });

    it('should generate SVG card for profile with long bio', async () => {
      mockPrismaService.profile.findFirst = vi.fn().mockResolvedValueOnce({
        username: 'procreator',
        fullName: 'Pro Creator',
        bio: 'This is an extremely long user biography specifically crafted to test truncation beyond one hundred characters in length for SVG rendering.',
        _count: { followers: 1250, following: 100, posts: 45 },
        user: { verificationLevel: 'BASIC' },
      });

      const svg = await service.generateProfileOgImage('procreator');
      expect(svg).toContain('<svg');
      expect(svg).toContain('Pro Creator');
      expect(svg).toContain('1250 Followers');
      expect(svg).toContain('CircleSfera');
    });

    it('escapes markup in SVG cards', async () => {
      mockPrismaService.post.findFirst.mockResolvedValueOnce({
        id: 'post-xss',
        caption: '<script>alert(1)</script>',
        profile: {
          username: 'eve',
          fullName: 'Eve <img>',
          verificationLevel: 'BASIC',
        },
        _count: { likes: 1, comments: 1 },
      });
      const postSvg = await service.generatePostOgImage('post-xss');
      expect(postSvg).not.toContain('<script>');
      expect(postSvg).not.toContain('<img>');
      expect(postSvg).toContain('&lt;script&gt;');

      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        username: 'eve',
        fullName: '"><x>',
        bio: "'</text><script>",
        _count: { followers: 0, following: 0, posts: 0 },
      });
      const profileSvg = await service.generateProfileOgImage('eve');
      expect(profileSvg).not.toContain('<script>');
      expect(profileSvg).not.toContain('<x>');
    });

    it('does not reflect the requested username when the profile is ineligible', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      const svg = await service.generateProfileOgImage('<script>hostile');
      expect(svg).not.toContain('hostile');
      expect(svg).toContain('CircleSfera User');
    });

    it('should generate SVG card for profile when profile is null', async () => {
      mockPrismaService.profile.findFirst = vi.fn().mockResolvedValueOnce(null);

      const svg = await service.generateProfileOgImage('unknownuser');
      expect(svg).toContain('<svg');
      expect(svg).toContain('CircleSfera User');
    });
  });
});
