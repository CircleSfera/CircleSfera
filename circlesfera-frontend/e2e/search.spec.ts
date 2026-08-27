import { expect, test } from '@playwright/test';

declare let window: any;

test.describe('Flujo de Búsqueda y Explorar', () => {
  test('debe permitir buscar y ver el feed de explorar', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
    });
    page.on('response', (res) => {
      if (res.status() === 401) {
        console.log('UNAUTHORIZED URL:', res.url());
      }
      if (res.status() === 400) {
        console.log('BAD REQUEST URL:', res.url());
      }
    });
    page.on('request', (req) => console.log('REQ:', req.url()));

    // Mock usuario actual
    const mockUser = {
      id: 'user1',
      email: 'test@example.com',
      roles: ['user'],
      profile: {
        id: 'profile1',
        userId: 'user1',
        username: 'tester',
        fullName: 'Tester',
        avatarUrl: null,
      },
    };

    // Mocks globales
    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser });
    });

    await page.route('**/api/v1/profiles/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser.profile });
    });

    await page.route('**/api/v1/notifications*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      });
    });

    await page.route('**/api/v1/notifications/unread-count*', async (route) => {
      await route.fulfill({ status: 200, json: { count: 0 } });
    });

    await page.route(
      '**/api/v1/chat/conversations/unread-count*',
      async (route) => {
        await route.fulfill({ status: 200, json: { count: 0 } });
      },
    );

    await page.route('**/api/v1/payments/status*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { active: true, plan: 'Free' },
      });
    });

    await page.route('**/api/v1/posts/*/likes/check*', async (route) => {
      await route.fulfill({ status: 200, json: { hasLiked: false } });
    });

    await page.route('**/api/v1/bookmarks/*/check*', async (route) => {
      await route.fulfill({ status: 200, json: { isBookmarked: false } });
    });

    // Mock historial de búsqueda
    await page.route('**/api/v1/search/history', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // Mock del feed de explorar
    const mockExploreFeed = {
      data: [
        {
          id: 'post-1',
          caption: 'Publicación interesante en Explore',
          createdAt: new Date().toISOString(),
          userId: 'user2',
          user: {
            id: 'user2',
            verificationLevel: 'VERIFIED',
            profile: {
              username: 'explorer',
              fullName: 'Explorer User',
              avatarUrl: null,
            },
          },
          likesCount: 15,
          commentsCount: 3,
          isLiked: false,
          media: [],
          tags: ['explore'],
        },
      ],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };

    await page.route('**/api/v1/feed/*', async (route) => {
      await route.fulfill({ status: 200, json: mockExploreFeed });
    });

    await page.route('**/api/v1/posts?sort=trending*', async (route) => {
      await route.fulfill({ status: 200, json: mockExploreFeed });
    });

    // Inyectamos el storage de autenticación
    await page.goto('/inject-storage-dummy-route');
    await page.evaluate(() => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            token: 'fake-jwt-token',
            user: {
              id: 'user1',
              email: 'test@example.com',
              roles: ['user'],
            },
            profile: {
              id: 'profile1',
              userId: 'user1',
              username: 'tester',
              fullName: 'Tester',
              avatarUrl: null,
            },
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    });

    // Navegamos a Explorar
    await page.goto('/explore');

    // Validamos que se cargue la publicación de explorar
    await expect(
      page.getByText('Publicación interesante en Explore').first(),
    ).toBeVisible();

    // Mock de resultados de búsqueda
    const mockSearchResults = {
      users: [
        {
          id: 'user3',
          profile: {
            username: 'alice',
            fullName: 'Alice Smith',
            avatarUrl: null,
          },
        },
      ],
      semanticPosts: [
        {
          id: 'post-2',
          caption: 'Resultado de búsqueda alice',
          createdAt: new Date().toISOString(),
          userId: 'user3',
          user: {
            id: 'user3',
            profile: {
              username: 'alice',
              fullName: 'Alice Smith',
              avatarUrl: null,
            },
          },
          likesCount: 5,
          commentsCount: 0,
          isLiked: false,
          media: [],
        },
      ],
    };

    await page.route('**/api/v1/search?q=alice*', async (route) => {
      await route.fulfill({ status: 200, json: mockSearchResults });
    });

    // Realizamos una búsqueda
    const searchInput = page.getByPlaceholder(/Buscar|Search/i).first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('alice');

    // Si la búsqueda es instantánea, esperamos a que aparezcan los resultados
    await expect(page.getByText('Alice Smith').first()).toBeVisible();
    await expect(
      page.getByText('Resultado de búsqueda alice').first(),
    ).toBeVisible();
  });
});
