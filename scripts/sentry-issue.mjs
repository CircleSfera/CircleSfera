#!/usr/bin/env node
/**
 * One issue of the error tracker, by its short id: shown, or marked resolved.
 *
 *   node scripts/sentry-issue.mjs inspect CIRCLESFERA-BACKEND-1B
 *   node scripts/sentry-issue.mjs resolve CIRCLESFERA-BACKEND-1B
 *
 * Needs SENTRY_WRITE_TOKEN. Actions logs are public: it prints the short id,
 * the status, the event count and the dates only, never the message of the
 * error, which can carry what a person wrote.
 */
const TOKEN = process.env.SENTRY_WRITE_TOKEN;
const API = 'https://de.sentry.io/api/0';
const ORG = 'circlesfera';
const SHORT_ID = /^CIRCLESFERA-[A-Z]+-[A-Z0-9]+$/;

const [mode, shortId] = process.argv.slice(2);

if (!TOKEN) {
  console.error('SENTRY_WRITE_TOKEN is not set');
  process.exit(1);
}
if (!['inspect', 'resolve'].includes(mode) || !SHORT_ID.test(shortId ?? '')) {
  console.error(
    'Usage: sentry-issue.mjs inspect|resolve CIRCLESFERA-<PROJECT>-<ID>',
  );
  process.exit(1);
}

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: only the status is shown.
  }
  return { status: response.status, data };
}

function show(issue) {
  console.log(
    `${issue.shortId}: ${issue.status}, ${issue.count} events, first ${issue.firstSeen}, last ${issue.lastSeen}`,
  );
}

const found = await call('GET', `/organizations/${ORG}/shortids/${shortId}/`);
if (found.status !== 200 || !found.data?.group?.id) {
  console.error(`Could not find ${shortId}: ${found.status}`);
  process.exit(1);
}
const issue = found.data.group;
show(issue);

if (mode === 'resolve' && issue.status !== 'resolved') {
  const done = await call('PUT', `/organizations/${ORG}/issues/${issue.id}/`, {
    status: 'resolved',
  });
  if (done.status !== 200) {
    console.error(`Could not resolve ${shortId}: ${done.status}`);
    process.exit(1);
  }
  const after = await call('GET', `/organizations/${ORG}/issues/${issue.id}/`);
  if (after.status !== 200 || after.data?.status !== 'resolved') {
    console.error(
      `${shortId} is not resolved after the change: ${after.status}`,
    );
    process.exit(1);
  }
  show(after.data);
}
