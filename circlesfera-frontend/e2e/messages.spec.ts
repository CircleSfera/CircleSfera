import { expect, test } from '@playwright/test';
import { prepareAuthenticatedSession } from './helpers/session';

test.describe('Direct', () => {
  test('abre una conversación y envía un mensaje', async ({ page }) => {
    const { user } = await prepareAuthenticatedSession(page, {
      scenario: 'direct',
    });

    const now = new Date().toISOString();
    const messages: Record<string, unknown>[] = [
      {
        id: 'msg-0',
        content: 'Hola!',
        createdAt: now,
        updatedAt: now,
        senderId: 'user2',
        conversationId: 'conv-1',
        isDeleted: false,
      },
    ];

    const conversation = {
      id: 'conv-1',
      isGroup: false,
      name: null,
      createdAt: now,
      updatedAt: now,
      participants: [
        {
          id: 'participant-me',
          conversationId: 'conv-1',
          profileId: user.id,
          profile: {
            id: user.id,
            username: user.username,
            fullName: user.displayName,
            avatar: null,
          },
        },
        {
          id: 'participant-friend',
          conversationId: 'conv-1',
          profileId: 'user2',
          profile: {
            id: 'user2',
            username: 'friend',
            fullName: 'My Friend',
            avatar: null,
          },
        },
      ],
      messages,
    };

    await page.route('**/api/v1/chat/conversations**', async (route) => {
      const url = route.request().url();
      if (url.includes('/messages')) {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, json: messages });
          return;
        }
      }
      if (url.includes('/read')) {
        await route.fulfill({ status: 200, json: { success: true } });
        return;
      }
      if (url.includes('unread-count')) {
        await route.fulfill({ status: 200, json: { count: 0 } });
        return;
      }
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, json: [conversation] });
        return;
      }
      await route.fulfill({ status: 200, json: {} });
    });

    await page.route('**/api/v1/chat/messages', async (route) => {
      if (route.request().method() === 'POST') {
        const reqData = JSON.parse(route.request().postData() || '{}') as {
          content?: string;
          tempId?: string;
        };
        const newMsg = {
          id: `msg-${Date.now()}`,
          content: reqData.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          senderId: user.id,
          conversationId: 'conv-1',
          isDeleted: false,
          tempId: reqData.tempId,
        };
        messages.push(newMsg);
        await route.fulfill({ status: 200, json: newMsg });
        return;
      }
      await route.fulfill({ status: 200, json: {} });
    });

    await page.goto('/direct/inbox');
    await page.getByText('My Friend').click();
    await expect(page.getByText('Hola!').first()).toBeVisible();

    const messageInput = page.getByPlaceholder('Mensaje...');
    await messageInput.fill('Este es un mensaje automático de E2E');
    await messageInput.press('Enter');

    await expect(
      page.getByText('Este es un mensaje automático de E2E').first(),
    ).toBeVisible();
  });
});
