#!/usr/bin/env node

/**
 * CircleSfera frontend performance budgets
 *
 * Serves the production build of the frontend, measures the key public pages
 * with Lighthouse (mobile profile, performance category only) and compares
 * the median of several runs against the budgets in `lighthouse-budgets.json`:
 *
 *   - Largest Contentful Paint (ms)
 *   - Cumulative Layout Shift
 *   - Total Blocking Time (ms)
 *   - JavaScript transferred (KiB)
 *
 * A page over any budget fails the run. Budgets start at the measured
 * baseline and only tighten. A page with no budgets is measured and reported
 * but cannot fail.
 *
 * Usage:
 *   npm run build --prefix circlesfera-frontend
 *   node scripts/lighthouse-budgets.mjs
 *
 * Set CHROME_PATH to use a specific Chrome or Chromium binary.
 */

import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';

const run = promisify(execFile);

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'circlesfera-frontend/dist');
const REPORT_DIR = resolve(ROOT, 'lighthouse-report');
const LIGHTHOUSE = resolve(ROOT, 'node_modules/.bin/lighthouse');
const config = JSON.parse(
  readFileSync(resolve(ROOT, 'lighthouse-budgets.json'), 'utf8'),
);

const METRICS = [
  { key: 'lcpMs', label: 'LCP (ms)', digits: 0 },
  { key: 'cls', label: 'CLS', digits: 3 },
  { key: 'tbtMs', label: 'TBT (ms)', digits: 0 },
  { key: 'scriptKb', label: 'JS (KiB)', digits: 0 },
];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
};

const COMPRESSED = new Set(['.html', '.js', '.css', '.json', '.svg']);

// Static server for the build, like the production web server: gzip for text
// assets and the single-page-app fallback (a path that is not a file answers
// with index.html).
function serveBuild() {
  const gzipped = new Map();
  const server = createServer(async (req, res) => {
    const path = normalize(
      decodeURIComponent(new URL(req.url, 'http://x').pathname),
    );
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !extname(file) || !existsSync(file)) {
      file = join(DIST, 'index.html');
    }
    const type = extname(file);
    const headers = {
      'content-type': CONTENT_TYPES[type] ?? 'application/octet-stream',
    };
    try {
      let body = await readFile(file);
      if (
        COMPRESSED.has(type) &&
        /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
      ) {
        if (!gzipped.has(file)) gzipped.set(file, gzipSync(body));
        body = gzipped.get(file);
        headers['content-encoding'] = 'gzip';
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

async function measureOnce(url, outputPath) {
  await run(
    LIGHTHOUSE,
    [
      url,
      '--only-categories=performance',
      '--output=json',
      `--output-path=${outputPath}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (report.runtimeError) {
    throw new Error(`${url}: ${report.runtimeError.message}`);
  }
  const requests = report.audits['network-requests']?.details?.items ?? [];
  const scriptBytes = requests
    .filter((request) => request.resourceType === 'Script')
    .reduce((total, request) => total + (request.transferSize ?? 0), 0);
  return {
    lcpMs: report.audits['largest-contentful-paint'].numericValue,
    cls: report.audits['cumulative-layout-shift'].numericValue,
    tbtMs: report.audits['total-blocking-time'].numericValue,
    scriptKb: scriptBytes / 1024,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summaryTable(results) {
  const lines = [
    `| Page | ${METRICS.map((metric) => metric.label).join(' | ')} |`,
    `| --- | ${METRICS.map(() => '---').join(' | ')} |`,
  ];
  for (const { page, medians } of results) {
    const cells = METRICS.map(({ key, digits }) => {
      const value = medians[key].toFixed(digits);
      const budget = page.budgets?.[key];
      if (budget === undefined) return `${value} (no budget)`;
      const mark = medians[key] > budget ? '❌' : '✅';
      return `${mark} ${value} / ${budget}`;
    });
    lines.push(`| ${page.name} \`${page.path}\` | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error(`❌ No frontend build found at ${DIST}. Build it first.`);
    process.exit(1);
  }
  mkdirSync(REPORT_DIR, { recursive: true });

  const server = await serveBuild();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  const failures = [];

  try {
    for (const page of config.pages) {
      const runs = [];
      for (let attempt = 1; attempt <= config.runs; attempt++) {
        const output = join(REPORT_DIR, `${page.name}-${attempt}.json`);
        runs.push(await measureOnce(`${origin}${page.path}`, output));
      }
      const medians = Object.fromEntries(
        METRICS.map(({ key }) => [key, median(runs.map((r) => r[key]))]),
      );
      results.push({ page, medians });
      for (const { key, label, digits } of METRICS) {
        const budget = page.budgets?.[key];
        if (budget !== undefined && medians[key] > budget) {
          failures.push(
            `${page.name}: ${label} ${medians[key].toFixed(digits)} is over the budget of ${budget}`,
          );
        }
      }
    }
  } finally {
    server.close();
  }

  const table = summaryTable(results);
  console.log(
    `\nMedian of ${config.runs} runs, measured / budget:\n\n${table}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Performance budgets\n\nMedian of ${config.runs} runs, measured / budget.\n\n${table}\n`,
    );
  }

  if (failures.length > 0) {
    console.error('❌ Performance budgets exceeded:');
    for (const failure of failures) console.error(`   - ${failure}`);
    process.exit(1);
  }
  console.log('✅ Every page is within its performance budgets.');
}

main().catch((error) => {
  console.error(`❌ Lighthouse run failed: ${error.message}`);
  process.exit(1);
});
