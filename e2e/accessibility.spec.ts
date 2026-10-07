import { expect, type Page, test } from '@playwright/test';
import {
  type A11yFinding,
  describeFindings,
  scanA11y,
} from './helpers/a11y.js';
import {
  enterAsNewUser,
  openOwnLatestPost,
  prepareGuest,
  publishPostWithCaption,
} from './helpers/session.js';

// Key pages at the mobile reference size. Serious and critical WCAG 2.2 AA
// violations fail the run; every page is scanned before failing so one run
// lists them all.
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function settle(page: Page, ready: () => Promise<void>): Promise<void> {
  await ready();
  // Let entry transitions finish so contrast is measured on final colours.
  await page.waitForTimeout(600);
}

test.describe('Accessibility', () => {
  test('sign-in and sign-up pages', async ({ page }, testInfo) => {
    await prepareGuest(page);
    const findings: A11yFinding[] = [];

    await page.goto('/accounts/login');
    await settle(page, () => expect(page.locator('#identifier')).toBeVisible());
    findings.push(...(await scanA11y(page, 'login', testInfo)));

    await page.goto('/accounts/emailsignup');
    await settle(page, () =>
      expect(page.locator('form').first()).toBeVisible(),
    );
    findings.push(...(await scanA11y(page, 'registration', testInfo)));

    expect(findings, describeFindings(findings)).toEqual([]);
  });

  test('signed-in pages', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    // The sign-in helper waits for the desktop sidebar, so sign in at
    // desktop size, then scan at the mobile reference size.
    await page.setViewportSize({ width: 1280, height: 800 });
    const account = await enterAsNewUser(page, { scenario: 'a11y' });
    await page.setViewportSize({ width: 390, height: 844 });
    const findings: A11yFinding[] = [];
    const visit = async (
      name: string,
      path: string,
      ready: () => Promise<void>,
    ) => {
      await page.goto(path);
      await settle(page, ready);
      findings.push(...(await scanA11y(page, name, testInfo)));
    };
    const nav = () => expect(page.locator('nav:visible').first()).toBeVisible();

    await visit('feed', '/', nav);
    await visit('profile', `/${account.username}`, nav);
    await visit('composer', '/create?mode=post', () =>
      expect(page.getByTestId('content-composer')).toBeVisible(),
    );
    await visit('chat', '/direct/inbox', nav);
    await visit('settings', '/accounts', nav);
    await visit('settings-security', '/accounts/security', nav);
    await visit('checkout', '/pricing', () =>
      expect(page.locator('main, [role="main"]').first()).toBeVisible(),
    );

    // The composer helper drives the desktop layout too.
    await page.setViewportSize({ width: 1280, height: 800 });
    await publishPostWithCaption(page, `a11y ${Date.now()}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await openOwnLatestPost(page, account.username);
    await settle(page, nav);
    findings.push(...(await scanA11y(page, 'post', testInfo)));

    expect(findings, describeFindings(findings)).toEqual([]);
  });
});
