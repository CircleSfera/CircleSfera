#!/usr/bin/env node
// Every request the app makes must name a route the server has. A path
// that is one word off answers "not found" in production and nothing else
// notices: the service tests replace the client, and the server tests call
// the real routes. This reads both sides and compares them.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_SRC = join(root, 'src');
const BACKEND_SRC = join(root, '../circlesfera-backend/src');

// Requests the app still makes to routes the server does not have. Each
// one is a feature that does not work; the list is here so that it can
// only get shorter.
const KNOWN_MISSING = [
  // Voice notes: the upload route is `uploads`, and it does not take the
  // recorded format yet.
  'POST uploads/file',
  // Push notifications of the native apps.
  'POST push/subscribe-native',
  'DELETE push/unsubscribe-native',
];

function filesUnder(dir, keep) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

// A route parameter, or a value written into the path, is any one segment.
const segments = (path) =>
  path
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((part) => (part.startsWith(':') || part.includes('${') ? ':x' : part));

/** The routes the server declares, as "VERB a/:x/b". */
function serverRoutes() {
  const routes = new Set();
  for (const file of filesUnder(BACKEND_SRC, (name) =>
    name.endsWith('.controller.ts'),
  )) {
    const source = readFileSync(file, 'utf8');
    const base =
      /@Controller\(\s*(?:\{[^}]*path:\s*)?['"`]([^'"`]*)['"`]/.exec(
        source,
      )?.[1] ?? '';
    const handlers = source.matchAll(
      /@(Get|Post|Put|Patch|Delete)\(\s*(\[[^\]]*\]|['"`][^'"`]*['"`])?\s*\)/g,
    );
    for (const [, verb, given] of handlers) {
      const paths = given
        ? [...given.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1])
        : [''];
      for (const path of paths) {
        routes.add(
          `${verb.toUpperCase()} ${segments(`${base}/${path}`).join('/')}`,
        );
      }
    }
  }
  return routes;
}

/** The requests the app makes with a path written in place. */
function clientCalls() {
  const calls = [];
  for (const file of filesUnder(
    FRONTEND_SRC,
    (name) => /\.tsx?$/.test(name) && !name.includes('.test.'),
  )) {
    const source = readFileSync(file, 'utf8');
    const found = source.matchAll(
      /\b(?:apiClient|api)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*(['"`])((?:(?!\2)[\s\S])*)\2/g,
    );
    for (const [, verb, , path] of found) {
      calls.push({
        file: relative(root, file),
        route: `${verb.toUpperCase()} ${segments(path).join('/')}`,
      });
    }
  }
  return calls;
}

const routes = [...serverRoutes()].map((route) => route.split(' '));
const calls = clientCalls();

function hasRoute(route) {
  const [verb, path] = route.split(' ');
  const wanted = (path ?? '').split('/');
  return routes.some(([candidateVerb, candidatePath = '']) => {
    const have = candidatePath.split('/');
    return (
      candidateVerb === verb &&
      have.length === wanted.length &&
      have.every(
        (part, i) => part === wanted[i] || part === ':x' || wanted[i] === ':x',
      )
    );
  });
}

const errors = [];
// Reading nothing would pass for the wrong reason.
if (routes.length < 300 || calls.length < 300) {
  errors.push(
    `read ${routes.length} server routes and ${calls.length} requests: too few, the reading is broken`,
  );
}
for (const { file, route } of calls) {
  if (!hasRoute(route) && !KNOWN_MISSING.includes(route)) {
    errors.push(`no server route for ${route}  (${file})`);
  }
}
const made = new Set(calls.map(({ route }) => route));
for (const route of KNOWN_MISSING) {
  if (!made.has(route) || hasRoute(route)) {
    errors.push(`${route} is no longer missing: take it off KNOWN_MISSING`);
  }
}

if (errors.length > 0) {
  console.error(`api routes: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log(
  `api routes: ${calls.length} requests checked against ${routes.length} server routes (${KNOWN_MISSING.length} known gaps).`,
);
