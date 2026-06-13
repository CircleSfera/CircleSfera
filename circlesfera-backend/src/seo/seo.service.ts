import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SeoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async generateSitemap(): Promise<string> {
    const baseUrl = 'https://circlesfera.com';

    // Fetch public user profiles
    const publicProfiles = await this.prisma.profile.findMany({
      where: {
        user: { isActive: true },
      },
      select: { username: true, updatedAt: true },
    });

    // Fetch public posts (not locked/premium)
    const publicPosts = await this.prisma.post.findMany({
      where: {
        visibility: 'PUBLIC',
        isPremium: false,
      },
      select: { id: true, createdAt: true },
      take: 1000,
      orderBy: { createdAt: 'desc' },
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Static Pages -->
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/explore</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/pricing</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/accounts/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>

  <!-- Profiles -->
`;

    for (const profile of publicProfiles) {
      xml += `  <url>
    <loc>${baseUrl}/${profile.username}</loc>
    <lastmod>${profile.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>\n`;
    }

    xml += `\n  <!-- Posts -->\n`;

    for (const post of publicPosts) {
      xml += `  <url>
    <loc>${baseUrl}/p/${post.id}</loc>
    <lastmod>${post.createdAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
    }

    xml += `</urlset>`;

    return xml;
  }

  generateRobotsTxt(): string {
    const baseUrl = 'https://circlesfera.com';
    return `User-agent: *
Allow: /
Allow: /p/*
Allow: /explore
Disallow: /settings
Disallow: /wallet
Disallow: /admin
Disallow: /messages
Disallow: /api/

Sitemap: ${baseUrl}/api/v1/sitemap.xml
`;
  }
}
