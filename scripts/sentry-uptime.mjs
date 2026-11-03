#!/usr/bin/env node
/**
 * The uptime checks of CircleSfera in the error tracker, and the alert that
 * tells a person when one fails.
 *
 *   node scripts/sentry-uptime.mjs inspect   # read only: what exists
 *   node scripts/sentry-uptime.mjs apply     # add what is missing
 *
 * Needs SENTRY_WRITE_TOKEN. Actions logs are public: it prints names, ids,
 * public addresses and settings, never an email address or a token.
 */
const TOKEN = process.env.SENTRY_WRITE_TOKEN;
const API = 'https://de.sentry.io/api/0';
const ORG = 'circlesfera';
const PROJECT = 'circlesfera-frontend';
// What must be checked from outside the server: the site and its API.
const TARGETS = [
  { name: 'circlesfera.com', url: 'https://circlesfera.com' },
  { name: 'API health', url: 'https://circlesfera.com/api/v1/health' },
];
const ALERT_NAME = 'CircleSfera is down';

if (!TOKEN) {
  console.error('SENTRY_WRITE_TOKEN is not set');
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
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text.slice(0, 300);
  }
  return { status: response.status, data };
}

// Only what is safe to show in a public log.
function strip(value) {
  return JSON.parse(
    JSON.stringify(value, (key, v) =>
      /email|token|secret|password|dsn/i.test(key) ? '[hidden]' : v,
    ),
  );
}

async function inspect() {
  const access = await call('GET', `/organizations/${ORG}/`);
  console.log('Token access:', access.data?.access);

  const detectors = await call(
    'GET',
    `/organizations/${ORG}/detectors/?project=all&per_page=100`,
  );
  console.log(`Detectors (${detectors.status}):`);
  for (const d of Array.isArray(detectors.data) ? detectors.data : []) {
    console.log(JSON.stringify(strip(d), null, 2));
  }
  if (!Array.isArray(detectors.data)) console.log(detectors.data);

  const workflows = await call(
    'GET',
    `/organizations/${ORG}/workflows/?per_page=100`,
  );
  console.log(`Alerts (${workflows.status}):`);
  for (const w of Array.isArray(workflows.data) ? workflows.data : []) {
    console.log(JSON.stringify(strip(w), null, 2));
  }
  if (!Array.isArray(workflows.data)) console.log(workflows.data);

  const members = await call('GET', `/organizations/${ORG}/members/`);
  console.log(`Members (${members.status}):`);
  for (const m of Array.isArray(members.data) ? members.data : []) {
    console.log(`  user ${m.user?.id} role ${m.orgRole ?? m.role}`);
  }
}

async function apply() {
  const detectors = await call(
    'GET',
    `/organizations/${ORG}/detectors/?project=all&per_page=100`,
  );
  if (!Array.isArray(detectors.data)) {
    throw new Error(`Could not read the detectors (${detectors.status})`);
  }
  const uptime = detectors.data.filter((d) => /uptime/i.test(d.type ?? ''));
  const urlOf = (d) =>
    d.dataSources?.[0]?.queryObj?.url ??
    d.dataSources?.[0]?.url ??
    d.config?.url;
  const model = uptime[0];
  if (!model) throw new Error('No uptime check to copy the settings of');

  const ids = [];
  for (const target of TARGETS) {
    const found = uptime.find((d) => urlOf(d) === target.url);
    if (found) {
      console.log(`Uptime check present: ${target.url} (${found.id})`);
      ids.push(found.id);
      continue;
    }
    // The same settings as the check that exists, for another address.
    const source = model.dataSources?.[0]?.queryObj ?? {};
    const created = await call(
      'POST',
      `/organizations/${ORG}/projects/${model.projectId ?? PROJECT}/detectors/`,
      {
        name: target.name,
        type: model.type,
        config: model.config,
        dataSources: [{ ...source, url: target.url }],
      },
    );
    console.log(`Uptime check for ${target.url}: ${created.status}`);
    if (created.status >= 300) {
      console.log(JSON.stringify(strip(created.data), null, 2));
      throw new Error('Could not add the uptime check');
    }
    ids.push(created.data.id);
  }

  const workflows = await call(
    'GET',
    `/organizations/${ORG}/workflows/?per_page=100`,
  );
  const existing = Array.isArray(workflows.data)
    ? workflows.data.find((w) => w.name === ALERT_NAME)
    : undefined;
  if (existing) {
    console.log(`Alert present: ${ALERT_NAME} (${existing.id})`);
    return;
  }
  console.log(
    'The alert is not created yet: its shape is read from the inspect run first.',
  );
  console.log(`Checks to connect: ${ids.join(', ')}`);
}

const mode = process.argv[2];
if (mode === 'inspect') await inspect();
else if (mode === 'apply') await apply();
else {
  console.error('Usage: node scripts/sentry-uptime.mjs inspect|apply');
  process.exit(1);
}
