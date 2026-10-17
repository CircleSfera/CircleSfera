import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Areas that stay the owner's (ADR-0028): direct messages, money, the
// owner's notices and the account. No route there may be opened to a team
// member until a later step reviews it.
const OWNER_ONLY_DIRS = [
  'chat',
  'payments',
  'monetization',
  'notifications',
  'users',
  'admin',
  'push',
];

const SRC = join(import.meta.dirname, '..');

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllers(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('routes open to team members', () => {
  it('none in the areas that stay with the owner', () => {
    const opened = OWNER_ONLY_DIRS.flatMap((dir) =>
      controllers(join(SRC, dir)).filter((file) =>
        readFileSync(file, 'utf8').includes('@MemberAllowed('),
      ),
    );
    expect(opened).toEqual([]);
  });

  it('the owner areas exist, so the check above looks somewhere', () => {
    for (const dir of OWNER_ONLY_DIRS) {
      expect(controllers(join(SRC, dir)).length, dir).toBeGreaterThan(0);
    }
  });

  it('in the creator tools, only figures open: promotions, revenue and its export stay with the owner', () => {
    const source = readFileSync(
      join(SRC, 'creator', 'creator.controller.ts'),
      'utf8',
    );
    // Each route block from one decorator line to the next method.
    const blocks = source.split(/\n(?= {2}@(?:Get|Post|Patch|Delete|Put)\()/);
    const opened = blocks
      .filter((b) => b.includes('@MemberAllowed('))
      .map((b) => b.match(/@(?:Get|Post|Patch|Delete|Put)\('([^']*)'\)/)?.[1]);
    expect(opened.sort()).toEqual(
      [
        'activity-chart',
        'analytics/retention',
        'analytics/top-posts',
        'posts',
        'stats',
        'stories',
      ].sort(),
    );
    for (const block of blocks.filter((b) => b.includes('@MemberAllowed('))) {
      expect(block).toContain("@MemberAllowed('analytics.read')");
    }
  });
});
