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
    const fallbackImage = 'https://circlesfera.com/assets/og-default.jpg';

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

            // Point to dynamic OpenGraph image generator endpoint
            imageUrl = `${baseUrl}/api/v1/og-image/post/${postId}`;
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
          
          // Point to dynamic OpenGraph image generator endpoint
          imageUrl = `${baseUrl}/api/v1/og-image/profile/${username}`;
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

  /**
   * Dynamically renders a 1200x630 SVG OpenGraph Card for a Post.
   */
  async generatePostOgImage(postId: string): Promise<string> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { include: { profile: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const authorName = post?.user.profile?.fullName || post?.user.profile?.username || 'CircleSfera User';
    const username = post?.user.profile?.username || 'user';
    const caption = post?.caption
      ? post.caption.length > 90 ? `${post.caption.substring(0, 90)}...` : post.caption
      : 'Visual content on CircleSfera';
    const likes = post?._count.likes || 0;
    const comments = post?._count.comments || 0;
    const isVerified = post?.user.verificationLevel !== 'BASIC';

    return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0B0F19" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0EA5E9" />
          <stop offset="100%" stop-color="#6366F1" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bgGrad)" />
      <rect x="0" y="0" width="1200" height="8" fill="url(#accentGrad)" />
      <rect x="60" y="60" width="1080" height="510" rx="24" fill="#1F2937" fill-opacity="0.5" stroke="#374151" stroke-width="2" />
      <circle cx="130" cy="140" r="40" fill="#0EA5E9" fill-opacity="0.3" />
      <text x="130" y="150" font-family="Inter, sans-serif" font-size="32" font-weight="bold" fill="#0EA5E9" text-anchor="middle">${username[0].toUpperCase()}</text>
      <text x="190" y="135" font-family="Inter, sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF">${authorName}</text>
      <text x="190" y="165" font-family="Inter, sans-serif" font-size="20" fill="#9CA3AF">@${username} ${isVerified ? '✓' : ''}</text>
      <text x="100" y="270" font-family="Inter, sans-serif" font-size="32" font-weight="500" fill="#F3F4F6">"${caption.replace(/"/g, '&quot;')}"</text>
      <rect x="100" y="390" width="900" height="2" fill="#374151" />
      <text x="100" y="440" font-family="Inter, sans-serif" font-size="22" font-weight="bold" fill="#38BDF8">❤️ ${likes} Likes</text>
      <text x="280" y="440" font-family="Inter, sans-serif" font-size="22" font-weight="bold" fill="#818CF8">💬 ${comments} Comments</text>
      <text x="1020" y="520" font-family="Inter, sans-serif" font-size="24" font-weight="900" fill="url(#accentGrad)" text-anchor="end">CircleSfera</text>
    </svg>`;
  }

  /**
   * Dynamically renders a 1200x630 SVG OpenGraph Card for a Profile.
   */
  async generateProfileOgImage(username: string): Promise<string> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      include: {
        user: {
          include: {
            _count: { select: { followers: true, following: true, posts: true } },
          },
        },
      },
    });

    const fullName = profile?.fullName || profile?.username || 'CircleSfera User';
    const userHandle = profile?.username || username;
    const bio = profile?.bio
      ? profile.bio.length > 100 ? `${profile.bio.substring(0, 100)}...` : profile.bio
      : `Explore @${userHandle} profile on CircleSfera.`;
    const followers = profile?.user?._count?.followers || 0;
    const following = profile?.user?._count?.following || 0;
    const postsCount = profile?.user?._count?.posts || 0;

    return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradProfile" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0B0F19" />
          <stop offset="100%" stop-color="#1F2937" />
        </linearGradient>
        <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#38BDF8" />
          <stop offset="100%" stop-color="#818CF8" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bgGradProfile)" />
      <rect x="60" y="60" width="1080" height="510" rx="24" fill="#111827" fill-opacity="0.8" stroke="#374151" stroke-width="2" />
      <circle cx="160" cy="180" r="55" fill="url(#brandGrad)" />
      <text x="160" y="195" font-family="Inter, sans-serif" font-size="44" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${userHandle[0].toUpperCase()}</text>
      <text x="240" y="170" font-family="Inter, sans-serif" font-size="36" font-weight="bold" fill="#FFFFFF">${fullName}</text>
      <text x="240" y="205" font-family="Inter, sans-serif" font-size="24" fill="#38BDF8">@${userHandle}</text>
      <text x="100" y="300" font-family="Inter, sans-serif" font-size="26" font-weight="400" fill="#D1D5DB">"${bio.replace(/"/g, '&quot;')}"</text>
      <rect x="100" y="390" width="900" height="2" fill="#374151" />
      <text x="100" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${followers} Followers</text>
      <text x="350" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${following} Following</text>
      <text x="600" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${postsCount} Posts</text>
      <text x="1020" y="520" font-family="Inter, sans-serif" font-size="24" font-weight="900" fill="url(#brandGrad)" text-anchor="end">CircleSfera</text>
    </svg>`;
  }
}
