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

      // The same person has the same picture in the list and in the header:
      // their photo, or the same initials on the same colour.
      const pictures = await page
        .getByRole('img', { name: 'ana', exact: true })
        .evaluateAll((images) =>
          images
            .filter((image) => image.getBoundingClientRect().width > 1)
            .map((image) => (image as HTMLImageElement).src),
        );
      expect(pictures.length).toBeGreaterThan(0);
      expect(new Set(pictures).size).toBe(1);
      expect(pictures[0]).toMatch(/^data:image\/svg\+xml,/);

      // On a phone the conversation has the screen to itself.
      const bottomBar = page.getByRole('navigation', {
        name: 'Navegación móvil',
      });
      if (viewport.width < 768) {
        await expect(bottomBar).toHaveCount(0);
        const field = await page.getByPlaceholder('Mensaje...').boundingBox();
        expect(
          viewport.height - ((field?.y ?? 0) + (field?.height ?? 0)),
        ).toBeLessThan(40);
      }

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

      // The actions of a message are 44 px, wholly on screen, and lie over
      // no message: not the one they belong to, nor the ones around it.
      await bubble.hover();
      const edit = page.getByRole('button', { name: 'Editar' });
      await expect(edit).toBeVisible();
      await page.waitForTimeout(400);
      const actions = [];
      for (const name of ['Responder', 'Reaccionar', 'Editar', 'Eliminar']) {
        const box = await page
          .getByRole('button', { name, exact: true })
          .last()
          .boundingBox();
        expect(box, name).not.toBeNull();
        if (!box) continue;
        expect(box.width, name).toBeGreaterThanOrEqual(44);
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.x, name).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, name).toBeLessThanOrEqual(viewport.width);
        actions.push(box);
      }
      const messages = await page
        .locator('.whitespace-pre-wrap')
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.closest('[class*="group/msg"]'))
            .map((element) => {
              const box = (
                element.closest('[class*="group/msg"]')?.firstElementChild ??
                element
              ).getBoundingClientRect();
              return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              };
            }),
        );
      expect(messages.length).toBeGreaterThan(1);
      const overlaps = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) =>
        a.x < b.x + b.width - 1 &&
        b.x < a.x + a.width - 1 &&
        a.y < b.y + b.height - 1 &&
        b.y < a.y + a.height - 1;
      for (const action of actions) {
        for (const message of messages) {
          expect(overlaps(action, message)).toBe(false);
        }
      }
    });
  });
}
