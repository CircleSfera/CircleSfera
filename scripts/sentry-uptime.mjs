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
// What is checked from outside the server. The plan allows one uptime check,
// so it is the API's health: it fails when the server, its proxy, the API,
// the database or the cache is down. The home page is static and answers
// even when the API is down, so it no longer takes the one check.
const TARGETS = [
  { name: 'API health', url: 'https://circlesfera.com/api/v1/health' },
];
const ALERT_NAME = 'CircleSfera is down';
// The projects whose checks are read, by id: the list for the whole
// organization is refused to this token.
const PROJECT_IDS = ['4511288202887248', '4511288199938128'];

async function allDetectors({ strict = false } = {}) {
  const found = [];
  for (const id of PROJECT_IDS) {
    const page = await call(
      'GET',
      `/organizations/${ORG}/detectors/?project=${id}&per_page=100`,
    );
    console.log(`Detectors of project ${id}: ${page.status}`);
    if (Array.isArray(page.data)) found.push(...page.data);
    else if (strict) {
      // A read that failed is not a project with no checks: adding one now
      // could add it twice.
      throw new Error(`Could not read the checks of project ${id}`);
    } else console.log(page.data);
  }
  return found;
}

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

  for (const d of await allDetectors()) {
    console.log(JSON.stringify(strip(d), null, 2));
  }

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
  const uptime = (await allDetectors({ strict: true })).filter(
    (d) => d.type === 'uptime_domain_failure',
  );
  const urlOf = (d) => d.dataSources?.[0]?.queryObj?.url;
  const model = uptime.find((d) => urlOf(d) === TARGETS[0].url) ?? uptime[0];
  if (!model) throw new Error('No uptime check to copy the settings of');
  const query = model.dataSources[0].queryObj;

  // A check of an address no longer listed is turned off, never deleted, so
  // it frees the plan's one check and can be turned on again.
  for (const d of uptime) {
    if (TARGETS.some((t) => t.url === urlOf(d)) || d.enabled === false) continue;
    const off = await call('PUT', `/organizations/${ORG}/detectors/${d.id}/`, {
      enabled: false,
    });
    console.log(`Uptime check ${urlOf(d)} (${d.id}) turned off: ${off.status}`);
    if (off.status >= 300) {
      console.log(JSON.stringify(strip(off.data), null, 2));
      throw new Error('Could not turn the uptime check off');
    }
  }

  const ids = [];
  for (const target of TARGETS) {
    const found = uptime.find((d) => urlOf(d) === target.url);
    if (found) {
      console.log(`Uptime check present: ${target.url} (${found.id})`);
      ids.push(found.id);
      // A check the provider turned off watches nothing: turn it on again,
      // and show the provider's answer when it refuses (such as a plan limit).
      if (found.enabled === false) {
        const enabled = await call(
          'PUT',
          `/organizations/${ORG}/detectors/${found.id}/`,
          { enabled: true },
        );
        console.log(`Uptime check ${found.id} turned on: ${enabled.status}`);
        if (enabled.status >= 300) {
          console.log(JSON.stringify(strip(enabled.data), null, 2));
          throw new Error('Could not turn the uptime check on');
        }
      }
      continue;
    }
    // The same settings as the check that exists, for another address.
    const created = await call(
      'POST',
      `/organizations/${ORG}/projects/${model.projectId}/detectors/`,
      {
        name: `Uptime Monitoring for ${target.url}`,
        type: model.type,
        enabled: true,
        dataSources: [
          {
            url: target.url,
            method: query.method,
            headers: query.headers,
            body: query.body,
            intervalSeconds: query.intervalSeconds,
            timeoutMs: query.timeoutMs,
            traceSampling: query.traceSampling,
            assertion: query.assertion,
          },
        ],
        conditionGroup: {
          logicType: model.conditionGroup.logicType,
          conditions: model.conditionGroup.conditions.map(
            ({ type, comparison, conditionResult }) => ({
              type,
              comparison,
              conditionResult,
            }),
          ),
        },
        config: {
          mode: 1,
          environment: model.config.environment,
          downtimeThreshold: model.config.downtimeThreshold,
          recoveryThreshold: model.config.recoveryThreshold,
        },
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
  if (!Array.isArray(workflows.data)) {
    // Not knowing the alerts, adding one could send every email twice.
    throw new Error(`Could not read the alerts (${workflows.status})`);
  }
  const existing = workflows.data.find((w) => w.name === ALERT_NAME);
  if (existing) {
    const watched = new Set((existing.detectorIds ?? []).map(String));
    const missing = ids.filter((id) => !watched.has(String(id)));
    if (missing.length === 0) {
      console.log(`Alert present: ${ALERT_NAME} (${existing.id})`);
      return;
    }
    // A check added since: the alert watches it too.
    const updated = await call(
      'PUT',
      `/organizations/${ORG}/workflows/${existing.id}/`,
      { ...existing, detectorIds: [...watched, ...missing.map(String)] },
    );
    console.log(
      `Alert ${existing.id} now watches ${missing.join(', ')}: ${updated.status}`,
    );
    if (updated.status >= 300) {
      console.log(JSON.stringify(strip(updated.data), null, 2));
      throw new Error('Could not update the alert');
    }
    return;
  }
  // As the alerts that exist: an email to the issue's owners, or else to
  // every active member, when a check opens its outage.
  const alert = await call('POST', `/organizations/${ORG}/workflows/`, {
    name: ALERT_NAME,
    enabled: true,
    config: { frequency: 0 },
    triggers: {
      logicType: 'any-short',
      conditions: [
        {
          type: 'new_high_priority_issue',
          comparison: true,
          conditionResult: true,
        },
        {
          type: 'existing_high_priority_issue',
          comparison: true,
          conditionResult: true,
        },
      ],
      actions: [],
    },
    actionFilters: [
      {
        logicType: 'any-short',
        conditions: [],
        actions: [
          {
            type: 'email',
            integrationId: null,
            data: { fallthroughType: 'ActiveMembers' },
            config: { targetType: 'issue_owners', targetIdentifier: null },
          },
        ],
      },
    ],
    detectorIds: ids,
  });
  console.log(`Alert ${ALERT_NAME}: ${alert.status}`);
  if (alert.status >= 300) {
    console.log(JSON.stringify(strip(alert.data), null, 2));
    throw new Error('Could not add the alert');
  }
  console.log(`Alert ${alert.data.id} watches ${ids.join(', ')}`);
}

const mode = process.argv[2];
if (mode === 'inspect') await inspect();
else if (mode === 'apply') await apply();
else {
  console.error('Usage: node scripts/sentry-uptime.mjs inspect|apply');
  process.exit(1);
}
