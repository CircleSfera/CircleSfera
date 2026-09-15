import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session';

test.describe('Direct', () => {
  test('two users can start a thread and send a message', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ctxOpts = {
      baseURL,
      storageState: { cookies: [], origins: [] } as const,
    };
    const contextA = await browser.newContext(ctxOpts);
    const contextB = await browser.newContext(ctxOpts);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const userA = await enterAsNewUser(pageA);
    const userB = await enterAsNewUser(pageB);

    await pageA.goto('/direct/inbox');
    await expect(pageA.getByText('Aún no hay mensajes')).toBeVisible();
    await pageA.getByRole('button', { name: 'Enviar Mensaje' }).click();

    const dialog = pageA.getByRole('dialog');
    await dialog.getByPlaceholder('Buscar...').fill(userB.username);
    await dialog.getByRole('button', { name: userB.username }).click();
    const startChat = dialog.getByRole('button', { name: 'Chat' });
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

    await pageB.goto('/direct/inbox');
    await expect(
      pageB.getByText(text).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await contextA.close();
    await contextB.close();
  });
});
