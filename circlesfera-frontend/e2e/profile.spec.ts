import { expect, test } from '@playwright/test';

declare let window: any;

test.describe('Flujo de Edición de Perfil', () => {
  test('debe permitir ver el perfil y editar la biografía', async ({
    page,
  }) => {
    // Escuchar errores para debug
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
    });
    page.on('response', (res) => {
      if (res.status() === 401) {
        console.log('UNAUTHORIZED REQUEST URL:', res.url());
      }
    });

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
        bio: 'Biografía original',
        avatarUrl: null,
      },
    };

    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser });
    });

    await page.route('**/api/v1/profiles/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser.profile });
    });

    // Mock del perfil público del usuario tester
    await page.route('**/api/v1/profiles/tester', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: mockUser.profile });
      } else {
        await route.continue();
      }
    });

    // Mock posts del usuario tester
    await page.route('**/api/v1/posts/user/tester*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      });
    });

    // Mock globales y notificaciones
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
              bio: 'Biografía original',
              avatarUrl: null,
            },
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    });

    // Navegar al perfil
    await page.goto('/tester');

    // Validar que se carga el perfil y se muestra el botón de editar
    await expect(page.getByText('Tester').first()).toBeVisible();
    await expect(page.getByText('Biografía original').first()).toBeVisible();

    const editButton = page
      .getByRole('link', { name: /Editar Perfil|Edit Profile/i })
      .first();
    await expect(editButton).toBeVisible();

    // Hacemos click en Editar Perfil (esto lleva a /accounts)
    await editButton.click({ force: true });

    // En SettingsHubIndex, hacemos click en el enlace para editar el perfil
    const editHubButton = page.locator('a[href="/accounts/profile"]').first();
    await expect(editHubButton).toBeVisible();
    await editHubButton.click({ force: true });

    // Validar que se carga la página de ajustes de perfil y se muestra el campo de bio
    const bioInput = page
      .getByPlaceholder(/Cuéntale al mundo|tell the world/i)
      .first();
    await expect(bioInput).toBeVisible();

    // Llenar el campo de bio
    await bioInput.fill('Biografía actualizada');

    // Mock de la actualización de perfil
    await page.route('**/api/v1/profiles/me', async (route) => {
      if (
        route.request().method() === 'PUT' ||
        route.request().method() === 'PATCH'
      ) {
        const updatedProfile = {
          ...mockUser.profile,
          bio: 'Biografía actualizada',
        };
        await route.fulfill({ status: 200, json: updatedProfile });
      } else {
        await route.fulfill({ status: 200, json: mockUser.profile });
      }
    });

    // Mock para que el próximo fetch del perfil traiga la nueva bio
    await page.route('**/api/v1/profiles/tester', async (route) => {
      if (route.request().method() === 'GET') {
        const updatedProfile = {
          ...mockUser.profile,
          bio: 'Biografía actualizada',
        };
        await route.fulfill({ status: 200, json: updatedProfile });
      } else {
        await route.continue();
      }
    });

    // Hacemos click en Guardar
    const saveButton = page.getByRole('button', { name: /Guardar|Save/i });
    await saveButton.click({ force: true });

    // Validar que el modal se cierra y la bio se actualiza
    await expect(page.getByText('Biografía actualizada').first()).toBeVisible();
  });
});
