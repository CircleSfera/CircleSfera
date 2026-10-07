// Every literal key passed to t('…') must exist in both languages, so no
// screen falls back to a hardcoded string or shows a raw key. Runs with
// `npm run lint`; kept out of the test suite so it does not count towards
// coverage.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src',
);
const catalogs = {
  en: JSON.parse(readFileSync(path.join(src, 'locales/en.json'), 'utf8')),
  es: JSON.parse(readFileSync(path.join(src, 'locales/es.json'), 'utf8')),
};

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory())
      return ['locales', 'test'].includes(e.name) ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function lookup(catalog, key) {
  return key
    .split('.')
    .reduce(
      (node, part) =>
        node && typeof node === 'object' ? node[part] : undefined,
      catalog,
    );
}

// Without `count` the call needs the key itself. With `count` it needs both
// plural forms, or the key itself, which i18next falls back to.
function resolves(catalog, key, plural) {
  const has = (k) => typeof lookup(catalog, k) === 'string';
  if (!plural) return has(key);
  return has(key) || (has(`${key}_one`) && has(`${key}_other`));
}

// The argument list of the t() call that starts at `from`, up to its
// closing parenthesis, to see whether it passes `count`.
function callArguments(text, from) {
  let depth = 1;
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}

const call = /\bt\(\s*['"]([a-zA-Z]\w*(?:\.\w+)*)['"]/g;
const files = sourceFiles(src);
const missing = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(call)) {
    const args = callArguments(text, m.index + m[0].indexOf('(') + 1);
    const plural = /\bcount\b/.test(
      args.slice(m[0].length - m[0].indexOf('(') - 1),
    );
    const langs = Object.entries(catalogs)
      .filter(([, catalog]) => !resolves(catalog, m[1], plural))
      .map(([lang]) => lang);
    if (langs.length)
      missing.push(
        `${path.relative(src, file)}: ${m[1]}${plural ? ' (plural)' : ''} (${langs.join(', ')})`,
      );
  }
}

if (missing.length) {
  console.error(
    `Translation keys missing from the catalog:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}
console.log(
  `i18n keys: ${files.length} files checked, all keys present in en and es.`,
);
