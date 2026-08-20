/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'refactor',
        'perf',
        'test',
        'docs',
        'build',
        'ci',
        'chore',
        'style',
        'revert',
      ],
    ],
    'header-max-length': [2, 'always', 100],
    // Prefer scopes from CONTRIBUTING.md; do not fail unknown ones
    // (Dependabot uses deps / deps-dev).
    'scope-empty': [0],
    'subject-case': [0],
  },
};
