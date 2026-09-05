#!/usr/bin/env node
/**
 * Generate circlesfera-documentation/03-api-catalog.generated.md from NestJS controllers.
 * Does not invent routes — only emits @Controller + @Get/@Post/@Put/@Patch/@Delete.
 *
 * Usage: node scripts/generate-api-inventory.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'circlesfera-backend', 'src');
const OUT = path.join(
  ROOT,
  'circlesfera-documentation',
  '03-api-catalog.generated.md',
);

const METHOD_RE =
  /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)/g;
const CONTROLLER_RE =
  /@Controller\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      files.push(full);
    }
  }
  return files;
}

function joinPath(prefix, route) {
  const parts = [];
  if (prefix) parts.push(prefix.replace(/^\/+|\/+$/g, ''));
  if (route !== undefined && route !== null && route !== '') {
    parts.push(String(route).replace(/^\/+|\/+$/g, ''));
  }
  const joined = parts.filter(Boolean).join('/');
  return joined ? `/${joined}` : '/';
}

function parseController(source, relPath) {
  const ctrlMatch = source.match(CONTROLLER_RE);
  if (!ctrlMatch) return null;
  const prefix = ctrlMatch[1] ?? ctrlMatch[2] ?? ctrlMatch[3] ?? '';

  const routes = [];
  for (const match of source.matchAll(METHOD_RE)) {
    const method = match[1].toUpperCase();
    const route = match[2] ?? match[3] ?? match[4] ?? '';
    routes.push({
      method,
      path: joinPath(prefix, route),
    });
  }

  return {
    source: relPath.replace(/\\/g, '/'),
    prefix: prefix ? `/${prefix}` : '(root)',
    routes,
  };
}

function sortKey(section) {
  const p = section.prefix === '(root)' ? '/' : section.prefix;
  return p.toLowerCase();
}

async function main() {
  const files = (await walk(SRC)).sort();
  const sections = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const rel = path.relative(SRC, file);
    const parsed = parseController(source, rel);
    if (!parsed) continue;
    if (parsed.routes.length === 0 && path.basename(file) === 'admin.controller.ts') {
      // Empty barrel / placeholder — skip silent empties with no routes
      continue;
    }
    sections.push(parsed);
  }

  // Group by prefix for readability, but keep per-file sections
  sections.sort((a, b) => {
    const c = sortKey(a).localeCompare(sortKey(b));
    if (c !== 0) return c;
    return a.source.localeCompare(b.source);
  });

  const generatedAt = new Date().toISOString().slice(0, 10);
  const lines = [
    '# 03 — API route catalog (generated)',
    '',
    `> **Generated:** ${generatedAt} by \`scripts/generate-api-inventory.mjs\`.`,
    '> **Do not edit by hand.** Re-run `npm run docs:api-inventory`.',
    '> Controllers under `circlesfera-backend/src/**/*.controller.ts` are the source of truth.',
    '> Paths are relative to the global prefix `api/v1`.',
    '',
    `Controllers scanned: **${files.length}**. Sections with routes: **${sections.filter((s) => s.routes.length).length}**.`,
    '',
  ];

  let routeCount = 0;
  for (const section of sections) {
    if (section.routes.length === 0) continue;
    const heading =
      section.prefix === '(root)'
        ? '`(root)`'
        : `\`${section.prefix}\``;
    lines.push(`### ${heading}`);
    lines.push('');
    lines.push(`Source: \`${section.source}\``);
    lines.push('');
    lines.push('| Method | Path |');
    lines.push('| --- | --- |');
    for (const r of section.routes) {
      lines.push(`| ${r.method} | \`${r.path}\` |`);
      routeCount += 1;
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push('');
  lines.push(`**Total routes emitted:** ${routeCount}`);
  lines.push('');

  await writeFile(OUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${OUT} (${routeCount} routes from ${files.length} controllers)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
