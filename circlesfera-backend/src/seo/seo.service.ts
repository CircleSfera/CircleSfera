import { Inject, Injectable } from '@nestjs/common';
import { type Prisma, Visibility } from '@prisma/client';
import {
  NOT_REMOVED,
  SHOWN_COMMENTS_COUNT,
} from '../common/policies/removed-content.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Public, unauthenticated surfaces (sitemap, Open Graph) may only describe
// profiles and posts that any anonymous visitor could already open: active,
// non-deactivated, non-banned accounts that are not private, and posts that are
// public, published, unlocked and not moderated out.
const PUBLIC_PROFILE_WHERE = {
  privacyLevel: { not: Visibility.PRIVATE },
  user: {
    isActive: true,
    deactivatedAt: null,
    isRootBanned: false,
    isTestAccount: false,
  },
} satisfies Prisma.ProfileWhereInput;

const PUBLIC_POST_WHERE = {
  visibility: Visibility.PUBLIC,
  isPremium: false,
  moderationStatus: 'VISIBLE',
  scheduledStatus: 'PUBLISHED',
  profile: PUBLIC_PROFILE_WHERE,
} satisfies Prisma.PostWhereInput;

// A sitemap file may hold 50,000 addresses; each part here holds fewer, so
// that one request to this public route reads a bounded number of rows.
export const SITEMAP_PART_SIZE = 10_000;

export const SITEMAP_KINDS = ['pages', 'profiles', 'posts'] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];

const SITE = 'https://circlesfera.com';

// The pages of the site that anyone can open, with how often they change.
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/explore', changefreq: 'hourly', priority: '0.9' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.8' },
  { path: '/accounts/login', changefreq: 'monthly', priority: '0.5' },
  { path: '/register', changefreq: 'monthly', priority: '0.5' },
];

// Where each part is published: at the root of the site, so that it may list
// any address of the site (a sitemap lists only addresses under its own
// folder) and is not under /api/, which robots.txt closes.
export const sitemapPartUrl = (kind: SitemapKind, page: number) =>
  `${SITE}/sitemap-${kind}-${page}.xml`;

const day = (date: Date) => date.toISOString().split('T')[0];

function urlEntry(
  loc: string,
  changefreq: string,
  priority: string,
  lastmod?: Date,
) {
  return `  <url>
    <loc>${escapeMarkup(loc)}</loc>
${lastmod ? `    <lastmod>${day(lastmod)}</lastmod>\n` : ''}    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
}

const urlset = (entries: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('')}</urlset>`;

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only same-origin absolute paths are echoed into the page. Anything else
// (scheme-relative, userinfo tricks, control characters) falls back to the home
// page instead of being reflected.
function sanitizeSitePath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  for (const char of path) {
    if (char === '\\' || char.charCodeAt(0) < 0x20) return '/';
  }
  return path;
}

@Injectable()
export class SeoService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // The site map index: the fixed pages, then the public Profiles and the
  // public posts in parts of SITEMAP_PART_SIZE, however many there are.
  async generateSitemapIndex(): Promise<string> {
    const [profiles, posts] = await Promise.all([
      this.prisma.profile.count({ where: PUBLIC_PROFILE_WHERE }),
      this.prisma.post.count({ where: PUBLIC_POST_WHERE }),
    ]);
    const parts = [
      sitemapPartUrl('pages', 1),
      ...this.partUrls('profiles', profiles),
      ...this.partUrls('posts', posts),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.map((loc) => `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>\n`).join('')}</sitemapindex>`;
  }

  // One part of the site map, or null when there is no such part. Parts are
  // read in a fixed order (oldest first), so a new Profile or post goes to
  // the last part and the earlier ones keep their addresses.
  async generateSitemapPart(
    kind: SitemapKind,
    page: number,
  ): Promise<string | null> {
    if (!Number.isInteger(page) || page < 1) return null;
    if (kind === 'pages') {
      if (page !== 1) return null;
      return urlset(
        STATIC_PAGES.map((p) =>
          urlEntry(`${SITE}${p.path}`, p.changefreq, p.priority),
        ),
      );
    }

    const window = {
      skip: (page - 1) * SITEMAP_PART_SIZE,
      take: SITEMAP_PART_SIZE,
    };
    if (kind === 'profiles') {
      const rows = await this.prisma.profile.findMany({
        where: PUBLIC_PROFILE_WHERE,
        select: { username: true, updatedAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...window,
      });
      if (rows.length === 0) return null;
      return urlset(
        rows.map((r) =>
          urlEntry(`${SITE}/${r.username}`, 'daily', '0.7', r.updatedAt),
        ),
      );
    }

    const rows = await this.prisma.post.findMany({
      where: PUBLIC_POST_WHERE,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...window,
    });
    if (rows.length === 0) return null;
    return urlset(
      rows.map((r) =>
        urlEntry(`${SITE}/p/${r.id}`, 'weekly', '0.6', r.createdAt),
      ),
    );
  }

  private partUrls(kind: SitemapKind, total: number): string[] {
    const parts = Math.ceil(total / SITEMAP_PART_SIZE);
    return Array.from({ length: parts }, (_, i) => sitemapPartUrl(kind, i + 1));
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

Sitemap: ${baseUrl}/sitemap.xml
`;
  }

  async generateOpenGraphHtml(requestedPath: string): Promise<string> {
    const baseUrl = 'https://circlesfera.com';
    const path = sanitizeSitePath(requestedPath);
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
          const post = await this.prisma.post.findFirst({
            where: { id: postId, ...PUBLIC_POST_WHERE },
            include: { profile: true },
          });

          if (post) {
            title = post.caption
              ? `${post.profile?.fullName || post.profile?.username} on CircleSfera: "${post.caption.substring(0, 50)}..."`
              : `Post by ${post.profile?.fullName || post.profile?.username}`;
            description = post.caption || description;

            // Point to dynamic OpenGraph image generator endpoint
            imageUrl = `${baseUrl}/api/v1/og-image/post/${encodeURIComponent(post.id)}`;
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
        const username = path.substring(1).split('?')[0]; // Remove leading slash
        const profile = await this.prisma.profile.findFirst({
          where: {
            username: { equals: username, mode: 'insensitive' },
            ...PUBLIC_PROFILE_WHERE,
          },
          include: {
            _count: { select: { followers: true, following: true } },
          },
        });

        if (profile) {
          title = `${profile.fullName} (@${profile.username}) | CircleSfera`;
          description = profile.bio
            ? profile.bio
            : `Follow @${profile.username} on CircleSfera. ${profile._count?.followers || 0} Followers.`;

          // Point to dynamic OpenGraph image generator endpoint
          imageUrl = `${baseUrl}/api/v1/og-image/profile/${encodeURIComponent(profile.username)}`;
        }
      }
    } catch (error) {
      console.error('Error generating OG metadata:', error);
      // Fallback to default metadata on error
    }

    const safeTitle = escapeMarkup(title);
    const safeDescription = escapeMarkup(description);
    const safeImage = escapeMarkup(imageUrl);
    const pageUrl = `${baseUrl}${path}`;
    const safeUrl = escapeMarkup(pageUrl);
    const redirectTarget = JSON.stringify(pageUrl).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    
    <!-- Open Graph meta tags -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${safeUrl}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:image" content="${safeImage}">

    <!-- Twitter Card meta tags -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${safeUrl}">
    <meta property="twitter:title" content="${safeTitle}">
    <meta property="twitter:description" content="${safeDescription}">
    <meta property="twitter:image" content="${safeImage}">
</head>
<body>
    <p>CircleSfera preview. Redirecting...</p>
    <script>window.location.replace(${redirectTarget});</script>
</body>
</html>`;
  }

  // Dynamically renders a 1200x630 SVG OpenGraph Card for a Post.
  async generatePostOgImage(postId: string): Promise<string> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, ...PUBLIC_POST_WHERE },
      include: {
        profile: true,
        _count: { select: { likes: true, comments: SHOWN_COMMENTS_COUNT } },
      },
    });

    const authorName = escapeMarkup(
      post?.profile?.fullName || post?.profile?.username || 'CircleSfera User',
    );
    const username = escapeMarkup(post?.profile?.username || 'user');
    const caption = escapeMarkup(
      post?.caption
        ? post.caption.length > 90
          ? `${post.caption.substring(0, 90)}...`
          : post.caption
        : 'Visual content on CircleSfera',
    );
    const likes = post?._count?.likes || 0;
    const comments = post?._count?.comments || 0;
    const isVerified = post?.profile?.verificationLevel !== 'BASIC';

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
      <text x="100" y="270" font-family="Inter, sans-serif" font-size="32" font-weight="500" fill="#F3F4F6">"${caption}"</text>
      <rect x="100" y="390" width="900" height="2" fill="#374151" />
      <text x="100" y="440" font-family="Inter, sans-serif" font-size="22" font-weight="bold" fill="#38BDF8">❤️ ${likes} Likes</text>
      <text x="280" y="440" font-family="Inter, sans-serif" font-size="22" font-weight="bold" fill="#818CF8">💬 ${comments} Comments</text>
      <text x="1020" y="520" font-family="Inter, sans-serif" font-size="24" font-weight="900" fill="url(#accentGrad)" text-anchor="end">CircleSfera</text>
    </svg>`;
  }

  // Dynamically renders a 1200x630 SVG OpenGraph Card for a Profile.
  async generateProfileOgImage(username: string): Promise<string> {
    const profile = await this.prisma.profile.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        ...PUBLIC_PROFILE_WHERE,
      },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            posts: { where: NOT_REMOVED },
          },
        },
      },
    });

    const fullName = escapeMarkup(
      profile?.fullName || profile?.username || 'CircleSfera User',
    );
    const userHandle = escapeMarkup(profile?.username || 'user');
    const bio = escapeMarkup(
      profile?.bio
        ? profile.bio.length > 100
          ? `${profile.bio.substring(0, 100)}...`
          : profile.bio
        : `Explore @${profile?.username || 'user'} profile on CircleSfera.`,
    );
    const followers = profile?._count?.followers || 0;
    const following = profile?._count?.following || 0;
    const postsCount = profile?._count?.posts || 0;

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
      <text x="100" y="300" font-family="Inter, sans-serif" font-size="26" font-weight="400" fill="#D1D5DB">"${bio}"</text>
      <rect x="100" y="390" width="900" height="2" fill="#374151" />
      <text x="100" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${followers} Followers</text>
      <text x="350" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${following} Following</text>
      <text x="600" y="445" font-family="Inter, sans-serif" font-size="24" font-weight="bold" fill="#F3F4F6">${postsCount} Posts</text>
      <text x="1020" y="520" font-family="Inter, sans-serif" font-size="24" font-weight="900" fill="url(#brandGrad)" text-anchor="end">CircleSfera</text>
    </svg>`;
  }
}
