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

  async generateOpenGraphHtml(path: string): Promise<string> {
    const baseUrl = 'https://circlesfera.com';
    const fallbackImage = 'https://circlesfera.com/og-image.jpg'; // TODO: Update with real default OpenGraph image

    // Default meta tags
    let title = 'CircleSfera - The Next-Gen Social Network';
    let description =
      'Connect, share, and monetize your content on CircleSfera.';
    let imageUrl = fallbackImage;

    try {
      // 1. Post Route Match: /p/:id
      if (path.startsWith('/p/')) {
        const postId = path.split('/p/')[1]?.split('?')[0];
        if (postId) {
          const post = await this.prisma.post.findUnique({
            where: { id: postId },
            include: { user: { include: { profile: true } }, media: true },
          });

          if (post) {
            title = post.caption
              ? `${post.user.profile?.fullName || post.user.profile?.username} on CircleSfera: "${post.caption.substring(0, 50)}..."`
              : `Post by ${post.user.profile?.fullName || post.user.profile?.username}`;
            description = post.caption || description;

            // Extract image if available
            if (post.media && post.media.length > 0) {
              const firstMedia = post.media[0];
              imageUrl =
                firstMedia.standardUrl ||
                firstMedia.thumbnailUrl ||
                firstMedia.url ||
                fallbackImage;
            }
          }
        }
      }
      // 2. Profile Route Match: /:username (Ignore static routes)
      else if (
        path.length > 1 &&
        !path.startsWith('/api') &&
        !path.startsWith('/accounts') &&
        !path.startsWith('/explore')
      ) {
        const username = path.substring(1).split('?')[0]; // remove leading slash
        const profile = await this.prisma.profile.findFirst({
          where: { username: { equals: username, mode: 'insensitive' } },
          include: {
            user: {
              include: {
                _count: { select: { followers: true, following: true } },
              },
            },
          },
        });

        if (profile) {
          title = `${profile.fullName} (@${profile.username}) | CircleSfera`;
          description = profile.bio
            ? profile.bio
            : `Follow @${profile.username} on CircleSfera. ${profile.user?._count?.followers || 0} Followers.`;
          imageUrl = profile.avatar || fallbackImage;
        }
      }
    } catch (error) {
      console.error('Error generating OG metadata:', error);
      // Fallback to default metadata on error
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${baseUrl}${path}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${baseUrl}${path}">
    <meta property="twitter:title" content="${title}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${imageUrl}">
</head>
<body>
    <p>CircleSfera preview. Redirecting...</p>
    <script>window.location.replace("${baseUrl}${path}");</script>
</body>
</html>`;
  }
}
