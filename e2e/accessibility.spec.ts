import { readFileSync } from 'node:fs';
import path from 'node:path';
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

// The signed-in pages render in Spanish (the account default), so the
// readiness checks read their text from the catalog.
const es = JSON.parse(
  readFileSync(
    path.resolve('circlesfera-frontend', 'src', 'locales', 'es.json'),
    'utf8',
  ),
);

// Key pages at the mobile reference size. Serious and critical WCAG 2.2 AA
// violations fail the run; every page is scanned before failing so one run
// lists them all.
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function settle(page: Page, ready: () => Promise<void>): Promise<void> {
  await ready();
  // Contrast is measured on final colours: wait until every finite animation
  // (CSS or Web Animations, which framer-motion uses) has finished. Endless
  // ones such as spinners and pulses never finish and are not waited for.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const iterations = animation.effect?.getTiming().iterations;
      return (
        iterations === Number.POSITIVE_INFINITY ||
        animation.playState !== 'running'
      );
    }),
  );
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
    // These routes load lazily behind the shared navigation: wait for their
    // own content, not just the navigation.
    await visit('chat', '/direct/inbox', () =>
      expect(page.getByPlaceholder(es.chat.search)).toBeVisible(),
    );
    await visit('settings', '/accounts', () =>
      expect(page.getByPlaceholder(es.settings.hub.filter)).toBeVisible(),
    );
    await visit('settings-security', '/accounts/security', () =>
      expect(
        page.getByText(es.settings.passkey_settings.title).first(),
      ).toBeVisible(),
    );
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
