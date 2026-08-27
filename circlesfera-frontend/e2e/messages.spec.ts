import { expect, test } from '@playwright/test';

declare let window: any;

test.describe('Flujo de Mensajería', () => {
  test('debe permitir ver una conversación y enviar un mensaje', async ({
    page,
  }) => {
    // Definimos datos falsos para el chat
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

    const mockParticipant = {
      id: 'participant-1',
      conversationId: 'conv-1',
      userId: 'user2',
      joinedAt: new Date().toISOString(),
      user: {
        id: 'user2',
        email: 'friend@example.com',
        profile: { username: 'friend', fullName: 'My Friend', avatarUrl: null },
      },
    };

    const mockConversation = {
      id: 'conv-1',
      isGroup: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: [mockParticipant],
      lastMessage: {
        id: 'msg-0',
        content: 'Hola!',
        createdAt: new Date().toISOString(),
        senderId: 'user2',
      },
    };

    const mockMessages: any[] = [
      {
        id: 'msg-0',
        content: 'Hola!',
        createdAt: new Date().toISOString(),
        senderId: 'user2',
        conversationId: 'conv-1',
        isDeleted: false,
      },
    ];

    // Mock usuario actual
    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser });
    });

    // Mock perfil actual
    await page.route('**/api/v1/profiles/me', async (route) => {
      await route.fulfill({ status: 200, json: mockUser.profile });
    });

    // Mock notificaciones y otros globales
    await page.route('**/api/v1/notifications*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      });
    });

    // Mock unread count de notificaciones
    await page.route('**/api/v1/notifications/unread-count*', async (route) => {
      await route.fulfill({ status: 200, json: { count: 0 } });
    });

    // Mock unread count de chat
    await page.route(
      '**/api/v1/chat/conversations/unread-count*',
      async (route) => {
        await route.fulfill({ status: 200, json: { count: 0 } });
      },
    );

    // Mock lista de conversaciones
    await page.route('**/api/v1/chat/conversations*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: [mockConversation] });
      } else {
        await route.continue();
      }
    });

    // Mock mensajes de la conversación
    await page.route(
      '**/api/v1/chat/conversations/conv-1/messages*',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, json: mockMessages });
        } else {
          await route.continue();
        }
      },
    );

    // Mock enviar mensaje
    await page.route('**/api/v1/chat/messages', async (route) => {
      if (route.request().method() === 'POST') {
        const reqData = JSON.parse(route.request().postData() || '{}');
        const newMsg = {
          id: `msg-${Date.now()}`,
          content: reqData.content,
          createdAt: new Date().toISOString(),
          senderId: 'user1',
          conversationId: 'conv-1',
          isDeleted: false,
          tempId: reqData.tempId,
        };
        mockMessages.push(newMsg);
        await route.fulfill({ status: 200, json: newMsg });
      } else {
        await route.continue();
      }
    });

    // Mock mark as read
    await page.route(
      '**/api/v1/chat/conversations/conv-1/read*',
      async (route) => {
        await route.fulfill({ status: 200, json: { success: true } });
      },
    );

    // Inyectamos el storage de autenticación
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

    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    page.on('request', (req) => {
      if (req.url().includes('/chat/conversations/conv-1/messages'))
        console.log('FETCHING MESSAGES:', req.url());
    });
    page.on('response', (res) => {
      if (res.status() >= 400)
        console.log('ERROR URL:', res.status(), res.url());
    });

    // Navegamos al inbox
    await page.goto('/direct/inbox');

    // Validar que se carga la conversación mockeada (amigo) en la barra lateral
    const convItem = page.getByText('My Friend');
    await convItem.waitFor({ state: 'visible' });

    // Hacemos click en la conversación
    await convItem.click();

    // Validamos que el mensaje "Hola!" se renderiza en la ventana del chat
    console.log('CONTENT START', await page.content(), 'CONTENT END');
    await page.screenshot({ path: 'test-results/chat-window.png' });
    await expect(page.getByText('Hola!').first()).toBeVisible();

    // Escribimos un nuevo mensaje
    const messageInput = page
      .getByPlaceholder(/Escribe un mensaje|Type a message/i)
      .first();
    await messageInput.waitFor({ state: 'visible' });
    await messageInput.fill('Este es un mensaje automático de E2E');
    await messageInput.press('Enter');

    // Validamos que el mensaje nuevo aparece en el chat
    await expect(
      page.getByText('Este es un mensaje automático de E2E').first(),
    ).toBeVisible();
  });
});
