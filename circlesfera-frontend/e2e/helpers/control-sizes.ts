import type { Page } from '@playwright/test';

/**
 * Measures the controls on screen. Every button and control must offer at
 * least 44 px in both directions and every text field at least 48 px in
 * height.
 */
const MIN_CONTROL = 44;
const MIN_TEXT_FIELD = 48;

/**
 * Visible controls on the screen that are under the minimum size. Links
 * that are part of a running text (`inlineLinks`, a selector) are text, not
 * controls of their own, and are left out.
 */
export async function undersizedControls(
  page: Page,
  { inlineLinks }: { inlineLinks?: string } = {},
): Promise<string[]> {
  // Let entry animations finish; a control measured mid-animation is smaller.
  await page.waitForTimeout(900);
  return page.evaluate(
    ({ minControl, minTextField, inlineLinks }) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="tab"], input:not([type=file]):not([type=checkbox]), textarea',
        ),
      )
        .filter((element) => !inlineLinks || !element.matches(inlineLinks))
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(
          ({ box }) =>
            box.width > 1 &&
            box.height > 1 &&
            box.top < window.innerHeight &&
            box.bottom > 0 &&
            box.left < window.innerWidth &&
            box.right > 0,
        )
        .filter(({ element, box }) => {
          const isTextField =
            element.tagName === 'TEXTAREA' ||
            (element.tagName === 'INPUT' &&
              !['range', 'color'].includes((element as HTMLInputElement).type));
          return isTextField
            ? box.height < minTextField - 0.5
            : box.height < minControl - 0.5 || box.width < minControl - 0.5;
        })
        .map(({ element, box }) => {
          const name = (
            element.getAttribute('aria-label') ||
            element.textContent ||
            element.getAttribute('placeholder') ||
            ''
          )
            .trim()
            .slice(0, 30);
          return `${element.tagName.toLowerCase()} ${Math.round(box.width)}x${Math.round(box.height)} "${name}"`;
        }),
    { minControl: MIN_CONTROL, minTextField: MIN_TEXT_FIELD, inlineLinks },
  );
}
