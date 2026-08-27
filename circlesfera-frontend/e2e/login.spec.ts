import { expect, test } from '@playwright/test';

test.describe('Flujo de Autenticación', () => {
  test('debe permitir a un usuario iniciar sesión exitosamente (Mockeado)', async ({
    page,
  }) => {
    // Interceptar la petición de login para devolver un token falso
    await page.route('**/api/v1/auth/login', async (route) => {
      const json = {
        accessToken: 'fake-access-token',
        user: {
          id: 'test-user-id',
          username: 'tester',
          email: 'test@example.com',
          role: 'user',
          avatarUrl: null,
        },
      };
      await route.fulfill({ status: 200, json });
    });

    // Interceptar la petición al perfil (me) para validar sesión
    await page.route('**/api/v1/profiles/me', async (route) => {
      const json = {
        id: 'test-user-id',
        username: 'tester',
        email: 'test@example.com',
        role: 'user',
      };
      await route.fulfill({ status: 200, json });
    });

    // Mocks adicionales para el feed que carga inmediatamente tras login
    await page.route('**/api/v1/posts*', async (route) => {
      await route.fulfill({
        status: 200,
        json: { posts: [], nextCursor: null },
      });
    });

    await page.goto('/login');

    // Validar que estamos en la página
    await expect(page).toHaveTitle(/CircleSfera/);

    // Rellenar formulario
    await page.fill('#identifier', 'test@example.com');
    await page.fill('#password', 'password123');

    // Click en iniciar sesión
    await page.click('data-testid=login-submit-button');

    // Esperar a que la redirección a la raíz (o feed) ocurra
    await page.waitForURL('**/');

    // Validar que el componente principal del muro / feed está visible (por ejemplo NavigationBar o CreatePost)
    const navBar = page.locator('nav').first();
    await expect(navBar).toBeVisible();
  });
});
