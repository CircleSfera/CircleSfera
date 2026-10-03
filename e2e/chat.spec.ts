import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';

test.describe('Direct', () => {
  test('two users can start a thread and send a message', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ctxOpts = {
      baseURL,
      storageState: { cookies: [], origins: [] },
    };
    const contextA = await browser.newContext(ctxOpts);
    const contextB = await browser.newContext(ctxOpts);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const userA = await enterAsNewUser(pageA, { scenario: 'chatsend' });
    const userB = await enterAsNewUser(pageB, { scenario: 'chatreceive' });

    await pageA.goto('/direct/inbox');
    await expect(pageA.getByText('Aún no hay mensajes')).toBeVisible();
    await pageA.getByRole('button', { name: 'Enviar Mensaje' }).click();

    const dialog = pageA.getByRole('dialog');
    await dialog.getByPlaceholder('Buscar...').fill(userB.username);
    await dialog.getByRole('button', { name: userB.username }).click();
    const startChat = dialog.getByRole('button', { name: 'Chat', exact: true });
    await expect(startChat).toBeEnabled();

    const created = pageA.waitForResponse(
      (res) =>
        res.url().includes('/chat/conversations') &&
        res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await startChat.evaluate((el) => (el as HTMLButtonElement).click());
    const createRes = await created;
    expect(createRes.status(), await createRes.text()).toBe(201);
    await expect(pageA).toHaveURL(/\/direct\/inbox\/t\//, { timeout: 15_000 });

    const text = `Hola E2E ${userA.username}`;
    const composer = pageA.getByPlaceholder('Mensaje...');
    await expect(composer).toBeVisible();
    await composer.fill(text);
    await composer.press('Enter');
    await expect(
      pageA.getByText(text).filter({ visible: true }).first(),
    ).toBeVisible();

    // B does not follow A, so the first message lands in Message
    // Requests, not in B's inbox, until B accepts it.
    await pageB.goto('/direct/inbox');
    await expect(pageB.getByText('Aún no hay mensajes')).toBeVisible();
    await pageB.getByRole('button', { name: /^Solicitudes/ }).click();
    const request = pageB.getByText(text).filter({ visible: true }).first();
    await expect(request).toBeVisible({ timeout: 20_000 });

    await request.click();
    await expect(pageB).toHaveURL(/\/direct\/inbox\/t\//, { timeout: 15_000 });
    const accepted = pageB.waitForResponse(
      (res) =>
        res.url().includes('/accept') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await pageB.getByRole('button', { name: 'Aceptar', exact: true }).click();
    expect((await accepted).ok()).toBe(true);
    await expect(pageB.getByPlaceholder('Mensaje...')).toBeVisible();

    // Once accepted, the conversation moves to B's inbox.
    await pageB.goto('/direct/inbox');
    await expect(
      pageB.getByText(text).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await contextA.close();
    await contextB.close();
  });
});
