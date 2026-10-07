import { AxeBuilder } from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

// WCAG 2.2 AA, including the 2.0 and 2.1 A/AA rules it builds on.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/**
 * A known violation that may not fail the suite until `until` (YYYY-MM-DD).
 * After that day it fails again, so every exception has to be fixed or
 * renewed on purpose. `target` limits it to one element (axe CSS selector).
 */
interface A11yException {
  rule: string;
  target?: string;
  reason: string;
  until: string;
}

export const A11Y_EXCEPTIONS: A11yException[] = [];

export interface A11yFinding {
  page: string;
  rule: string;
  impact: string;
  help: string;
  targets: string[];
}

function isExcepted(rule: string, target: string, today: string): boolean {
  return A11Y_EXCEPTIONS.some(
    (e) =>
      e.rule === rule && (!e.target || e.target === target) && today <= e.until,
  );
}

/**
 * Runs axe on the current page and returns the serious and critical WCAG
 * violations that no active exception covers. The full axe report is
 * attached to the test for inspection.
 */
export async function scanA11y(
  page: Page,
  name: string,
  testInfo: TestInfo,
): Promise<A11yFinding[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await testInfo.attach(`axe-${name}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const today = new Date().toISOString().slice(0, 10);
  const findings: A11yFinding[] = [];
  for (const v of results.violations) {
    if (!v.impact || !BLOCKING_IMPACTS.has(v.impact)) continue;
    const targets = v.nodes
      .map((n) => n.target.join(' '))
      .filter((t) => !isExcepted(v.id, t, today));
    if (targets.length === 0) continue;
    findings.push({
      page: name,
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: targets.slice(0, 5),
    });
  }
  return findings;
}

export function describeFindings(findings: A11yFinding[]): string {
  return findings
    .map(
      (f) =>
        `[${f.page}] ${f.rule} (${f.impact}): ${f.help}\n    ${f.targets.join('\n    ')}`,
    )
    .join('\n');
}
