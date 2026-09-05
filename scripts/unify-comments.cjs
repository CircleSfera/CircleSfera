#!/usr/bin/env node
// Deprecated — use scripts/unify-comments-pass2.cjs (line-based, safer).
// The original lexer pass could corrupt regex literals (e.g. /pattern\/\//i).
console.error(
  'Refusing to run unify-comments.cjs — use scripts/unify-comments-pass2.cjs',
);
process.exit(1);
