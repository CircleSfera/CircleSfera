/**
 * CircleSfera backend load test (k6)
 *
 * Each virtual user signs in as its own load-test account and then repeats
 * the core journey: read the feed, publish and delete a private post, send a
 * chat message to another load-test account and list its conversations.
 *
 * It writes real rows, so it only runs against a disposable environment (the
 * CI job, or a local backend on an isolated database) and never against real
 * users' data: a production host is always refused, and any host other than
 * localhost needs LOAD_TEST_ALLOW_REMOTE=true.
 *
 * The accounts must exist and have a verified email before the run
 * (load-tests/create-accounts.sh).
 *
 * Usage:
 *   k6 run -e API_URL=http://localhost:3005/api/v1 load-tests/api-load.js
 *
 * Environment:
 *   API_URL                 Backend API base URL (required)
 *   LOAD_TEST_PASSWORD      Password shared by the load-test accounts (required)
 *   LOAD_TEST_ACCOUNTS      Number of accounts created (default 10)
 *   LOAD_TEST_VUS           Peak virtual users (default 10)
 *   LOAD_TEST_DURATION      Time held at the peak (default 1m)
 *   LOAD_TEST_ALLOW_REMOTE  "true" to allow a non-local, non-production host
 */

import { check, fail, group, sleep } from 'k6';
import http from 'k6/http';

const API_URL = (__ENV.API_URL || '').replace(/\/+$/, '');
const PASSWORD = __ENV.LOAD_TEST_PASSWORD || '';
const ACCOUNTS = Number(__ENV.LOAD_TEST_ACCOUNTS || 10);
const VUS = Number(__ENV.LOAD_TEST_VUS || 10);
const DURATION = __ENV.LOAD_TEST_DURATION || '1m';

const PRODUCTION_HOSTS = /(^|\.)circlesfera\.com$/i;
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

export const options = {
  scenarios: {
    journey: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{group:::feed}': ['p(95)<1500'],
    'http_req_duration{group:::post}': ['p(95)<1500'],
    'http_req_duration{group:::chat}': ['p(95)<1500'],
    'http_req_duration{group:::login}': ['p(95)<3000'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function hostOf(url) {
  const match = /^https?:\/\/(\[[^\]]+\]|[^/:]+)/i.exec(url);
  return match ? match[1] : '';
}

function accountEmail(index) {
  return `loadtest-${index}@circlesfera.test`;
}

function csrfToken() {
  const res = http.get(`${API_URL}/csrf-token`);
  return res.status === 200 ? res.json('csrfToken') : '';
}

export function setup() {
  const host = hostOf(API_URL);
  if (!host)
    fail('API_URL is required, for example http://localhost:3005/api/v1');
  if (PRODUCTION_HOSTS.test(host)) {
    fail('Refusing to run a load test against production.');
  }
  if (!LOCAL_HOSTS.test(host) && __ENV.LOAD_TEST_ALLOW_REMOTE !== 'true') {
    fail(
      `Refusing to run against ${host} without LOAD_TEST_ALLOW_REMOTE=true.`,
    );
  }
  if (!PASSWORD) fail('LOAD_TEST_PASSWORD is required.');
  if (ACCOUNTS < 2) fail('LOAD_TEST_ACCOUNTS must be at least 2.');

  // Sign in as every account once to learn the Profile each one writes as.
  const profileIds = [];
  for (let index = 1; index <= ACCOUNTS; index++) {
    const jar = http.cookieJar();
    jar.clear(API_URL);
    const login = http.post(
      `${API_URL}/auth/login`,
      JSON.stringify({ identifier: accountEmail(index), password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    if (login.status !== 200) {
      fail(`Account ${accountEmail(index)} cannot sign in (${login.status}).`);
    }
    const me = http.get(`${API_URL}/profiles/me`);
    const profileId = me.status === 200 ? me.json('id') : undefined;
    if (!profileId) {
      fail(
        `Could not read the Profile of ${accountEmail(index)} (${me.status}).`,
      );
    }
    profileIds.push(profileId);
  }
  return { profileIds };
}

// Per virtual user: the CSRF token of its signed-in session.
let sessionCsrf = '';

function signIn(index) {
  group('login', () => {
    const res = http.post(
      `${API_URL}/auth/login`,
      JSON.stringify({ identifier: accountEmail(index), password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    check(res, { 'login succeeds': (r) => r.status === 200 });
    // The token is bound to the session, so it is read after signing in.
    sessionCsrf = csrfToken();
    check(sessionCsrf, { 'csrf token issued': (token) => token !== '' });
  });
}

export default function journey(data) {
  const index = ((__VU - 1) % ACCOUNTS) + 1;
  const partnerProfileId = data.profileIds[index % ACCOUNTS];
  if (!sessionCsrf) signIn(index);
  const writeHeaders = { ...JSON_HEADERS, 'x-csrf-token': sessionCsrf };

  group('feed', () => {
    const res = http.get(`${API_URL}/feed/foryou?page=1&limit=10`);
    check(res, { 'feed loads': (r) => r.status === 200 });
  });

  group('post', () => {
    const created = http.post(
      `${API_URL}/posts`,
      JSON.stringify({
        caption: `Load test post ${__VU}-${__ITER}`,
        visibility: 'PRIVATE',
      }),
      { headers: writeHeaders },
    );
    const published = check(created, {
      'post is created': (r) => r.status === 201,
    });
    if (published) {
      const removed = http.del(`${API_URL}/posts/${created.json('id')}`, null, {
        headers: writeHeaders,
      });
      check(removed, { 'post is deleted': (r) => r.status === 204 });
    }
  });

  group('chat', () => {
    const sent = http.post(
      `${API_URL}/chat/messages`,
      JSON.stringify({
        recipientId: partnerProfileId,
        content: `Load test message ${__VU}-${__ITER}`,
      }),
      { headers: writeHeaders },
    );
    check(sent, { 'message is sent': (r) => r.status === 201 });
    const list = http.get(`${API_URL}/chat/conversations`);
    check(list, { 'conversations load': (r) => r.status === 200 });
  });

  sleep(1);
}
