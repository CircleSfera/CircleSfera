// node --test .claude/hooks/guard.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { refusal } from './guard.mjs';

const bash = (command) =>
  refusal({ tool_name: 'Bash', tool_input: { command } });
const read = (file_path) =>
  refusal({ tool_name: 'Read', tool_input: { file_path } });

test('refuses a force push, in any spelling', () => {
  for (const command of [
    'git push --force origin fix/a',
    'git push -f',
    'git push --force-with-lease origin fix/a',
    'git push origin +fix/a',
    'cd x && git push -q -f origin fix/a 2>&1',
  ]) {
    assert.match(bash(command) ?? '', /force push/, command);
  }
});

test('refuses a push to main, and lets a branch through', () => {
  assert.match(bash('git push origin main') ?? '', /main/);
  assert.match(bash('git push origin HEAD:main') ?? '', /main/);
  assert.match(bash('git push origin refs/heads/main') ?? '', /main/);
  assert.equal(bash('git push -q -u origin fix/main-menu'), null);
  assert.equal(bash('git push -u origin chore/x'), null);
  assert.equal(bash('git push'), null);
  assert.equal(bash('git checkout main && git pull'), null);
});

test('refuses AI attribution in a commit or a pull request, and nothing else', () => {
  assert.match(
    bash(
      'git commit -m "fix: x\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>"',
    ) ?? '',
    /attribution/,
  );
  assert.match(
    bash('gh pr create --body "x\nhttps://claude.ai/code/session_1"') ?? '',
    /attribution/,
  );
  assert.match(
    bash('gh pr edit 1 --body "Generated with [Claude Code](x)"') ?? '',
    /attribution/,
  );
  assert.equal(
    bash('git commit -m "docs: how Claude Code agents work here"'),
    null,
  );
});

test('refuses environment files, and lets the example through', () => {
  assert.match(read('C:/repo/.env') ?? '', /Environment files/);
  assert.match(
    read('/srv/circlesfera/.env.production') ?? '',
    /Environment files/,
  );
  assert.match(bash('cat circlesfera-backend/.env') ?? '', /Environment files/);
  assert.equal(read('C:/repo/.env.example'), null);
  assert.equal(bash('cp .env.example .env.example.bak'), null);
  assert.equal(read('C:/repo/src/config/env.validation.ts'), null);
  assert.equal(bash('grep -n FRONTEND_URL src/app.module.ts'), null);
});

test('refuses skipped hooks and an admin merge', () => {
  assert.match(bash('git commit --no-verify -m x') ?? '', /Hooks/);
  assert.match(bash('gh pr merge 12 --admin --squash') ?? '', /admin merge/);
});

test('as a hook: exit code 2 with the reason, 0 otherwise', () => {
  const hook = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'guard.mjs',
  );
  const call = (command) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
      encoding: 'utf8',
    });
  const refused = call('git push --force');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /force push/);
  assert.equal(call('git status').status, 0);
});
