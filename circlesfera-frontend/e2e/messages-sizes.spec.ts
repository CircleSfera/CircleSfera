import { expect, type Page, test } from '@playwright/test';
import { undersizedControls } from './helpers/control-sizes';
import { prepareAuthenticatedSession } from './helpers/session';

/**
 * The inbox and a conversation, on a phone and on desktop: text is at least
 * 12 px, controls are at size, times are in the language of the app, long
 * messages keep their words whole and the actions of a message stay on
 * screen.
 */
const LONG =
  'Muy bien, acabo de volver de Cádiz. Te paso las fotos esta tarde, que hay unas cuantas del atardecer que te van a gustar.';

async function openInbox(page: Page) {
  const { user } = await prepareAuthenticatedSession(page);
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();
  const message = (
    id: string,
    content: string,
    mine: boolean,
    age: number,
  ) => ({
    id,
    content,
    createdAt: minutesAgo(age),
    updatedAt: minutesAgo(age),
    senderId: mine ? user.id : 'user2',
    conversationId: 'conv-1',
    isDeleted: false,
  });
  const messages = [
    message('message-1', 'Hola', false, 60),
    message('message-2', LONG, true, 58),
  ];
  const conversation = {
    id: 'conv-1',
    isGroup: false,
    name: null,
    createdAt: minutesAgo(900),
    updatedAt: minutesAgo(58),
    unreadCount: 1,
    participants: [
      {
        id: 'participant-me',
        conversationId: 'conv-1',
        profileId: user.id,
        profile: { id: user.id, username: user.username, avatar: null },
      },
      {
        id: 'participant-ana',
        conversationId: 'conv-1',
        profileId: 'user2',
        profile: {
          id: 'user2',
          username: 'ana',
          fullName: 'Ana Martín',
          avatar: null,
        },
      },
    ],
    messages: [messages[1]],
  };

  await page.route('**/api/v1/chat/conversations**', (route) => {
    const url = route.request().url();
    if (url.includes('/messages')) {
      return route.fulfill({ status: 200, json: messages });
    }
    if (url.includes('unread-count')) {
      return route.fulfill({ status: 200, json: { count: 1 } });
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
  await expect(page.getByText('Ana Martín').first()).toBeVisible();
}

async function expectInOrder(page: Page) {
  expect(await undersizedControls(page)).toEqual([]);

  const text = await page.evaluate(() => {
    const found = new Set<string>();
    const main = document.querySelector('main');
    if (!main) return ['no main'];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const content = walker.currentNode.textContent?.trim();
      const parent = walker.currentNode.parentElement;
      if (!content || !parent) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) found.add(`${size}px "${content.slice(0, 20)}"`);
    }
    return [...found];
  });
  expect(text).toEqual([]);

  // The app is in Spanish here: no 12-hour clock, whatever the browser uses.
  await expect(page.locator('main').getByText(/\d (AM|PM)\b/)).toHaveCount(0);
}

for (const [label, viewport] of [
  ['on a phone', { width: 390, height: 844 }],
  ['on desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test('the inbox and a conversation', async ({ page }) => {
      await openInbox(page);
      await expectInOrder(page);

      await page.getByText('Ana Martín').first().click();
      // The text of the bubble, not its preview in the inbox.
      const bubble = page.locator('.whitespace-pre-wrap', { hasText: LONG });
      await expect(bubble).toBeVisible();
      await expectInOrder(page);

      // No line of a long message ends inside a word.
      const brokenWord = await bubble.evaluate((element, message) => {
        const node = Array.from(element.childNodes).find(
          (child) => child.textContent === message,
        );
        if (!node) return 'message text not found';
        const range = document.createRange();
        let lastTop: number | null = null;
        for (let index = 0; index < message.length; index++) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const top = Math.round(range.getBoundingClientRect().top);
          if (
            lastTop !== null &&
            top > lastTop + 4 &&
            /\S/.test(message[index]) &&
            /\S/.test(message[index - 1])
          ) {
            return `"${message.slice(index - 4, index)}|${message.slice(index, index + 4)}"`;
          }
          lastTop = top;
        }
        return null;
      }, LONG);
      expect(brokenWord).toBeNull();

      // The actions of a message are 44 px and wholly on screen.
      await bubble.hover();
      const edit = page.getByRole('button', { name: 'Editar' });
      await expect(edit).toBeVisible();
      const box = await edit.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
    });
  });
}
