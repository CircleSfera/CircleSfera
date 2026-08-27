import { expect, test } from '@playwright/test';

declare let window: any;

test.describe('Flujo del Feed', () => {
  test('debe permitir crear una publicación y verla en el feed', async ({
    page,
  }) => {
    // Catch-all for any other API requests to prevent 401 redirects
    await page.route('**/api/v1/**', async (route) => {
      // Fallback fallback: return 200 empty JSON to prevent API client from crashing
      await route.fulfill({ status: 200, json: {} });
    });

    // En lugar de addInitScript (que falla por origen cruzado), vamos a / y luego inyectamos el storage y recargamos.

    // Interceptar la petición al perfil (me) para estar autenticado
    await page.route('**/api/v1/profiles/me', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'user1',
          username: 'tester',
          email: 'test@example.com',
          role: 'user',
        },
      });
    });

    // Interceptar llamadas de validación (por ejemplo turnstile o configuración si existen)
    await page.route('**/api/v1/system/config', async (route) => {
      await route.fulfill({
        status: 200,
        json: { turnstileSiteKey: '1x00000000000000000000AA' },
      });
    });

    const mockedPosts: any[] = [];

    // Mock sugerencias de usuarios para evitar crashes
    await page.route('**/api/v1/users/suggest*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // Mock stories
    await page.route('**/api/v1/stories*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // Mock livestreams
    await page.route('**/api/v1/live/active*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // Mock notificaciones
    await page.route('**/api/v1/notifications*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      });
    });

    // Mock usuario actual
    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'user1',
          email: 'test@example.com',
          profile: { username: 'tester', displayName: 'Tester' },
        },
      });
    });

    // Interceptar feed inicial y refrescos
    await page.route('**/api/v1/feed/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: {
            data: mockedPosts,
            meta: {
              total: mockedPosts.length,
              page: 1,
              limit: 10,
              totalPages: 1,
            },
          },
        });
      } else {
        await route.continue();
      }
    });

    // Interceptar creación de post
    await page.route('**/api/v1/posts', async (route) => {
      if (route.request().method() === 'POST') {
        const newPost = {
          id: 'post-123',
          userId: 'user1',
          caption: 'Este es un post de prueba desde Playwright E2E',
          user: {
            id: 'user1',
            email: 'test@example.com',
            profile: {
              username: 'tester',
              displayName: 'Tester',
              avatarUrl: null,
            },
          },
          media: [],
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isLiked: false,
          isSaved: false,
        };
        mockedPosts.unshift(newPost); // Append to top of feed
        await route.fulfill({
          status: 201,
          json: newPost,
        });
      } else {
        await route.continue();
      }
    });

    // Inyectamos el storage en una ruta dummy y luego vamos a /create
    await page.goto('/inject-storage-dummy-route');
    await page.evaluate(() => {
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            isAuthenticated: true,
            profile: {
              id: 'user1',
              username: 'tester',
              user: { email: 'test@example.com', role: 'user' },
            },
          },
          version: 0,
        }),
      );
    });

    // Ahora vamos a /create para abrir el modal directamente
    await page.goto('/create');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('e2e/dummy.png');

    // 2. Paso de edición (EditStep)
    // Tras subir, pasamos al paso de edición. Hacemos clic en Siguiente.
    const nextButton = page
      .locator(
        'button:has-text("Siguiente"), button:has-text("Next"), button:has-text("Compartir"), button:has-text("Share")',
      )
      .first();
    await nextButton.waitFor({ state: 'visible' });
    await nextButton.click();

    // 3. Paso de Caption (CaptionStep)
    // Aquí es donde está el textarea.
    const editor = page.getByRole('textbox').first();
    await editor.waitFor({ state: 'visible' });
    await editor.fill('Este es un post de prueba desde Playwright E2E');

    // Compartir el post
    const shareButton = page
      .locator('button:has-text("Compartir"), button:has-text("Share")')
      .first();
    await shareButton.waitFor({ state: 'visible' });
    await shareButton.click();

    // Esperar a que el modal se cierre (el textbox desaparece)
    await editor.waitFor({ state: 'hidden', timeout: 10000 });

    // Volver a Home para ver el feed
    await page.goto('/');

    // Validar que vemos el texto en la página principal
    await expect(
      page.getByText('Este es un post de prueba desde Playwright E2E').first(),
    ).toBeVisible();
  });
});
