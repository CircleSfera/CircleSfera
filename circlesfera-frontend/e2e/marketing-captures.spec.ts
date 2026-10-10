import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Page, test } from '@playwright/test';
import {
  prepareAuthenticatedSession,
  testPost,
  testProfile,
} from './helpers/session';

/**
 * Takes the pictures of the app that the public pages show inside their
 * phones: the real screens, with example content, in both languages.
 *
 * It only runs on request, after a screen changes:
 *   MARKETING_CAPTURES=1 npx playwright test e2e/marketing-captures.spec.ts
 */
test.skip(!process.env.MARKETING_CAPTURES, 'only runs on request');
test.use({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });

const OUT = process.env.MARKETING_CAPTURES_DIR ?? 'src/assets/marketing';
const ME = {
  id: 'profile-luis',
  username: 'luis',
  displayName: 'Luis Gómez',
  email: 'luis@example.com',
  role: 'user',
} as const;

const TEXT = {
  es: {
    place: 'Cádiz, España',
    caption: 'La última luz del día',
    frame: 'Un día en la sierra',
    chat: [
      '¿Quedamos el sábado?',
      '¡Sí! ¿A las 12?',
      'Perfecto, llevo la cámara',
    ],
    live: 'Concierto en casa',
  },
  en: {
    place: 'Cádiz, Spain',
    caption: 'The last light of the day',
    frame: 'A day in the hills',
    chat: [
      'Shall we meet on Saturday?',
      'Yes! At 12?',
      'Perfect, I will bring the camera',
    ],
    live: 'Concert at home',
  },
} as const;
type Lang = keyof typeof TEXT;

const page1 = (data: unknown[]) => ({
  data,
  meta: { total: data.length, page: 1, limit: 10, totalPages: 1 },
});
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const person = (username: string, fullName: string) => ({
  ...testProfile(),
  id: `profile-${username}`,
  userId: `profile-${username}`,
  username,
  fullName,
});
const PEOPLE = {
  ana: person('ana', 'Ana Martín'),
  marta: person('marta', 'Marta Ruiz'),
  pedro: person('pedro', 'Pedro Sanz'),
  sara: person('sara', 'Sara Gil'),
};
const picture = (n: number) => `https://cdn.example.com/scene-${n}.svg`;
const post = (
  n: number,
  who: keyof typeof PEOPLE,
  extra: Record<string, unknown> = {},
) =>
  testPost({
    id: `post-${n}`,
    profileId: PEOPLE[who].id,
    profile: PEOPLE[who],
    createdAt: ago(120),
    media: [{ id: `media-${n}`, url: picture(n), type: 'image', order: 0 }],
    ...extra,
  });

/** Drawings used as the example photos and videos; no real person's. */
const SCENES = [
  'sunset',
  'aurora',
  'coffee',
  'city',
  'dunes',
  'stage',
  'night',
].map((name) =>
  readFileSync(
    path.join('e2e', 'fixtures', 'marketing', `${name}.svg`),
    'utf8',
  ),
);

async function prepare(
  page: Page,
  lang: Lang,
  accountType: 'PERSONAL' | 'CREATOR' = 'PERSONAL',
) {
  await prepareAuthenticatedSession(page, {
    user: { ...ME, accountType },
    accountType,
  });
  await page.addInitScript((language) => {
    localStorage.setItem('i18nextLng', language);
  }, lang);
  await page.route('**/cdn.example.com/**', (route) => {
    const n = Number(/scene-(\d+)/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: SCENES[n % SCENES.length],
    });
  });
  const stories = (['marta', 'ana', 'sara', 'pedro'] as const).map(
    (who, index) => ({
      id: `story-${who}`,
      profileId: PEOPLE[who].id,
      profile: PEOPLE[who],
      url: picture(index + 4),
      mediaType: 'image',
      createdAt: ago(120),
      expiresAt: ago(-1300),
      isViewed: index > 1,
      _count: { views: 0 },
    }),
  );
  await page.route('**/api/v1/stories**', (route) =>
    route.fulfill({ status: 200, json: stories }),
  );
}

async function save(page: Page, name: string, lang: Lang) {
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: `${OUT}/${name}-${lang}.jpg`,
    type: 'jpeg',
    quality: 82,
  });
}

for (const lang of ['es', 'en'] as const) {
  const text = TEXT[lang];

  test.describe(lang, () => {
    test('home', async ({ page }) => {
      await prepare(page, lang);
      const posts = [
        post(0, 'marta', {
          caption: text.caption,
          location: text.place,
          likesCount: 1280,
          commentsCount: 42,
          _count: { likes: 1280, comments: 42 },
        }),
      ];
      await page.route('**/api/v1/feed/**', (route) =>
        route.fulfill({ status: 200, json: page1(posts) }),
      );
      await page.goto('/');
      await save(page, 'home', lang);
    });

    test('story', async ({ page }) => {
      await prepare(page, lang);
      await page.route('**/api/v1/feed/**', (route) =>
        route.fulfill({ status: 200, json: page1([]) }),
      );
      await page.goto('/');
      await page.getByText('marta', { exact: true }).first().click();
      await save(page, 'story', lang);
    });

    test('frames', async ({ page }) => {
      await prepare(page, lang);
      const frames = [
        post(1, 'sara', {
          type: 'FRAME',
          caption: text.frame,
          likesCount: 12400,
          _count: { likes: 12400, comments: 318 },
        }),
      ];
      await page.route('**/api/v1/posts/frames**', (route) =>
        route.fulfill({ status: 200, json: page1(frames) }),
      );
      await page.goto('/frames');
      await page.waitForSelector('video');
      // The example video is a drawing: show it as the still of the player.
      await page.evaluate((svg) => {
        const still = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        for (const video of document.querySelectorAll('video')) {
          video.poster = still;
          video.style.objectFit = 'cover';
        }
      }, SCENES[1]);
      await save(page, 'frames', lang);
    });

    test('chat', async ({ page }) => {
      await prepare(page, lang);
      const message = (index: number, mine: boolean, age: number) => ({
        id: `message-${index}`,
        content: text.chat[index],
        createdAt: ago(age),
        updatedAt: ago(age),
        senderId: mine ? ME.id : PEOPLE.ana.id,
        sender: mine ? { id: ME.id, username: ME.username } : PEOPLE.ana,
        conversationId: 'conv-1',
        isDeleted: false,
      });
      const messages = [
        message(0, false, 12),
        message(1, true, 10),
        message(2, false, 9),
      ];
      const conversation = {
        id: 'conv-1',
        isGroup: false,
        name: null,
        createdAt: ago(900),
        updatedAt: ago(9),
        unreadCount: 0,
        participants: [
          {
            id: 'participant-me',
            conversationId: 'conv-1',
            profileId: ME.id,
            profile: { id: ME.id, username: ME.username, avatar: null },
          },
          {
            id: 'participant-ana',
            conversationId: 'conv-1',
            profileId: PEOPLE.ana.id,
            profile: PEOPLE.ana,
          },
        ],
        messages: [messages[2]],
      };
      await page.route('**/api/v1/chat/conversations**', (route) => {
        const url = route.request().url();
        if (url.includes('/messages')) {
          return route.fulfill({ status: 200, json: messages });
        }
        if (url.includes('unread-count')) {
          return route.fulfill({ status: 200, json: { count: 0 } });
        }
        if (/conversations\/conv-1(\?|$)/.test(url)) {
          return route.fulfill({ status: 200, json: conversation });
        }
        if (route.request().method() === 'GET') {
          return route.fulfill({ status: 200, json: [conversation] });
        }
        return route.fulfill({ status: 200, json: {} });
      });
      await page.goto('/direct/inbox');
      await page.getByText('Ana Martín').first().click();
      await page.mouse.move(0, 0);
      await save(page, 'chat', lang);
    });

    test('live', async ({ page }) => {
      await prepare(page, lang);
      await page.routeWebSocket(/livekit/, () => {});
      await page.route(/livekit\.cloud/, () => {});
      await page.route('**/api/v1/live/**', (route) =>
        route.fulfill({
          status: 200,
          json: {
            token: 'test-token',
            title: text.live,
            host: { profile: { username: 'pedro', avatar: null } },
          },
        }),
      );
      await page.goto('/live/stream-1');
      // No broadcast reaches this browser: show a drawing where the video
      // of the broadcast would be.
      const waiting = page.getByText(/^(Esperando transmisión|Waiting for)/);
      await waiting.waitFor();
      await waiting.evaluate((element, svg) => {
        const still = document.createElement('img');
        still.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        still.alt = '';
        still.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
        // The waiting text fills the area of the video: the drawing takes
        // its place.
        element.replaceChildren(still);
      }, SCENES[5]);
      await save(page, 'live', lang);
    });

    test('creator', async ({ page }) => {
      await prepare(page, lang, 'CREATOR');
      const days = Array.from({ length: 14 }, (_, index) => ({
        date: ago((13 - index) * 1440).slice(0, 10),
        likes: 120 + index * 22 + (index % 3) * 30,
        comments: 20 + index * 3,
        views: 900 + index * 140 + (index % 4) * 120,
        followers: 8 + index * 2,
      }));
      await page.route('**/api/v1/creator/**', (route) => {
        const url = route.request().url();
        if (url.includes('activity-chart')) {
          return route.fulfill({ status: 200, json: days });
        }
        if (url.includes('creator/stats')) {
          return route.fulfill({
            status: 200,
            json: {
              postCount: 86,
              frameCount: 24,
              storyCount: 12,
              followerCount: 18400,
              followingCount: 312,
              totalLikes: 96200,
              totalComments: 4310,
              totalBookmarks: 2180,
              activePromotions: 0,
              engagementRate: 6.4,
              followerGrowth: 12,
              totalReach: 142000,
              // Income and subscribers are not calculated yet: the server
              // answers zero, and so does this example.
              mrr: 0,
              subscriberCount: 0,
              geoDistribution: [],
              activityHours: [],
              retentionStatus: { active: 0, churning: 0, churned: 0 },
              insights: {
                bestDayToPost: 'Saturday',
                bestHourToPost: 19,
                retentionRate: 0,
              },
            },
          });
        }
        if (url.includes('creator/posts')) {
          return route.fulfill({
            status: 200,
            json: page1(
              [0, 1, 3].map((n, index) => ({
                id: `post-${n}`,
                caption: [text.caption, text.frame, text.place][index],
                type: index === 1 ? 'FRAME' : 'POST',
                views: 8400 - index * 2100,
                performanceScore: 92 - index * 9,
                createdAt: ago(1440 * (index + 1)),
                media: [{ url: picture(n), type: 'image' }],
                _count: {
                  likes: 1280 - index * 310,
                  comments: 42 - index * 9,
                  bookmarks: 96 - index * 20,
                },
              })),
            ),
          });
        }
        return route.fulfill({ status: 200, json: page1([]) });
      });
      await page.goto('/creator/overview');
      // Show the part of the panel whose figures the product calculates.
      const performance = page.getByRole('heading', {
        name: /Rendimiento del Contenido|Content Performance/i,
      });
      await performance.waitFor();
      await performance.evaluate((heading) => {
        const top = heading.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - 76);
      });
      await save(page, 'creator', lang);
    });

    test('explore', async ({ page }) => {
      await prepare(page, lang);
      const posts = Array.from({ length: 12 }, (_, index) =>
        post(index, 'ana'),
      );
      await page.route('**/api/v1/feed/foryou**', (route) =>
        route.fulfill({ status: 200, json: page1(posts) }),
      );
      await page.goto('/explore');
      await save(page, 'explore', lang);
    });
  });
}
