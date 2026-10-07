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

function hasKey(catalog, key) {
  const get = (k) =>
    k
      .split('.')
      .reduce(
        (node, part) =>
          node && typeof node === 'object' ? node[part] : undefined,
        catalog,
      );
  return ['', '_one', '_other'].some(
    (suffix) => get(key + suffix) !== undefined,
  );
}

const call = /\bt\(\s*['"]([a-zA-Z]\w*\.[\w.]+)['"]/g;
const files = sourceFiles(src);
const missing = [];
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(call)) {
    const langs = Object.entries(catalogs)
      .filter(([, catalog]) => !hasKey(catalog, m[1]))
      .map(([lang]) => lang);
    if (langs.length)
      missing.push(
        `${path.relative(src, file)}: ${m[1]} (${langs.join(', ')})`,
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
