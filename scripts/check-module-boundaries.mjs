#!/usr/bin/env node

/**
 * CircleSfera module boundary check
 *
 * Runs dependency-cruiser over `src/` of the package it is started in, with
 * that package's `.dependency-cruiser.cjs`, and fails on any rule broken.
 *
 * It also fails when dependency-cruiser could not read the sources. Without a
 * TypeScript parser it can find (TypeScript 7 has no JavaScript API, so it
 * reads TypeScript through @swc/core) it only warns, cruises few or no files
 * and reports no violation, so the check would pass without checking. Every
 * source file under `src/` must therefore be a module of the graph.
 *
 * Usage, from a package directory:
 *   node ../scripts/check-module-boundaries.mjs
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DECLARATION = /\.d\.[mc]?ts$/;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) && !DECLARATION.test(entry.name)
      ? [relative(process.cwd(), path)]
      : [];
  });
}

let output;
try {
  output = execFileSync('npx', ['depcruise', 'src', '--output-type', 'json'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch (error) {
  // dependency-cruiser exits with the number of errors; the graph is still
  // printed.
  if (typeof error.stdout !== 'string' || error.stdout === '') throw error;
  output = error.stdout;
}

const graph = JSON.parse(output);
const failures = [];

for (const violation of graph.summary.violations) {
  if (violation.rule.severity !== 'error') continue;
  failures.push(`${violation.rule.name}: ${violation.from} → ${violation.to}`);
}

const cruised = new Set(graph.modules.map((module) => module.source));
const missing = sourceFiles('src').filter((file) => !cruised.has(file));
if (missing.length > 0) {
  const examples = missing.slice(0, 3).join(', ');
  failures.push(
    `${missing.length} source files were not read, for example ${examples}. ` +
      'dependency-cruiser found no parser for them: is @swc/core installed?',
  );
}

if (failures.length > 0) {
  console.error('Module boundary check failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `Module boundaries hold: ${graph.modules.length} modules, ${graph.summary.totalDependenciesCruised} dependencies.`,
);
