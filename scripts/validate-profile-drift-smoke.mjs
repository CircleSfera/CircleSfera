#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Automated smoke for User/Profile drift fixes (API shape + non-500).
 * Usage: node scripts/validate-profile-drift-smoke.mjs
 * Env: API_BASE (default http://localhost:8080/api/v1)
 */
import { generateSync } from 'otplib';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.API_BASE || 'http://localhost:8080/api/v1').replace(
  /\/$/,
  '',
);
const ADMIN_EMAIL = process.env.ADMIN_E2E_EMAIL || 'admin@circlesfera.com';
const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD || 'password123';
const ADMIN_TOTP =
  process.env.ADMIN_E2E_TOTP_SECRET || 'GK3L6YHMZSMTIZMLWAX3DJBYBOENFNJV';
const USER_EMAIL = process.env.SMOKE_USER_EMAIL || 'easyfeliu@gmail.com';
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || 'password123';

const results = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : '✗';
  console.log(`${icon} ${name}${detail ? `: ${detail}` : ''}`);
}

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const jar = {};
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function mergeCookies(a, b) {
  return { ...a, ...b };
}

async function fetchJson(
  path,
  { method = 'GET', cookies, body, csrfToken } = {},
) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (csrfToken && method !== 'GET' && method !== 'HEAD') {
    headers['x-csrf-token'] = csrfToken;
  }
  if (cookies && Object.keys(cookies).length) {
    headers.Cookie = cookieHeader(cookies);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { res, json };
}

async function loadAdminTotpSecret() {
  if (process.env.ADMIN_E2E_TOTP_SECRET)
    return process.env.ADMIN_E2E_TOTP_SECRET;
  try {
    const secret = execSync(
      `docker compose exec -T postgres psql -U CircleSfera -d CircleSfera -t -A -c "SELECT \\"totpSecret\\" FROM admin_identities WHERE email='admin@circlesfera.com' AND \\"totpEnabled\\" = true LIMIT 1;"`,
      { cwd: repoRoot },
    )
      .toString()
      .trim();
    return secret || ADMIN_TOTP;
  } catch {
    return ADMIN_TOTP;
  }
}

async function adminLogin() {
  const totpSecret = await loadAdminTotpSecret();
  const { res: r1, json: j1 } = await fetchJson('/admin-auth/login', {
    method: 'POST',
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!r1.ok) throw new Error(`admin login HTTP ${r1.status}`);
  let cookies = parseSetCookie(r1);

  if (j1.status === 'MFA_REQUIRED' || j1.status === 'MFA_SETUP_REQUIRED') {
    const code = String(generateSync({ secret: totpSecret }));
    const { res: r2, json: j2 } = await fetchJson('/admin-auth/mfa/verify', {
      method: 'POST',
      cookies,
      body: { mfaToken: j1.mfaToken, code },
    });
    if (!r2.ok)
      throw new Error(`admin MFA HTTP ${r2.status}: ${JSON.stringify(j2)}`);
    cookies = mergeCookies(cookies, parseSetCookie(r2));
  } else if (j1.status !== 'OK') {
    throw new Error(`unexpected admin login status: ${j1.status}`);
  }

  const { res: meRes } = await fetchJson('/admin-auth/me', { cookies });
  if (!meRes.ok) throw new Error('admin /me failed after login');
  return cookies;
}

async function userLogin() {
  const { res, json } = await fetchJson('/auth/login', {
    method: 'POST',
    body: { identifier: USER_EMAIL, password: USER_PASSWORD },
  });
  if (!res.ok)
    throw new Error(`user login HTTP ${res.status}: ${JSON.stringify(json)}`);
  const cookies = parseSetCookie(res);
  const { res: meRes, json: me } = await fetchJson('/profiles/me', { cookies });
  if (!meRes.ok) throw new Error('user /profiles/me failed');
  return { cookies, me };
}

function hasAdminProfile(row) {
  return Boolean(row?.user?.profile?.username || row?.profile?.username);
}

function reporterShapeOk(report) {
  if (!report.reporter) return true;
  if (report.details?.includes?.('[AI Automated Flag]')) return true;
  return Boolean(report.reporter.profile?.username);
}

function txPartiesOk(tx) {
  if (!tx.sender) return true;
  if (tx.sender.profiles && !tx.sender.profile) return false;
  return tx.sender.profile?.username !== undefined || !tx.sender.profile;
}

function sqlOne(sql) {
  return execSync(
    `docker compose exec -T postgres psql -U CircleSfera -d CircleSfera -t -A -c ${JSON.stringify(sql)}`,
    { cwd: repoRoot },
  )
    .toString()
    .trim();
}

async function loginPlatformUser(email, password = USER_PASSWORD) {
  const { res, json } = await fetchJson('/auth/login', {
    method: 'POST',
    body: { identifier: email, password },
  });
  if (!res.ok) {
    throw new Error(
      `login ${email} HTTP ${res.status}: ${JSON.stringify(json)}`,
    );
  }
  return parseSetCookie(res);
}

async function ensureCsrf(cookies) {
  const { res, json } = await fetchJson('/csrf-token', { cookies });
  if (!res.ok) throw new Error(`csrf-token HTTP ${res.status}`);
  return {
    csrfToken: json.csrfToken,
    cookies: mergeCookies(cookies, parseSetCookie(res)),
  };
}

async function validateWithFixtures(adminCookies, userCookies) {
  const { csrfToken, cookies: csrfCookies } = await ensureCsrf(userCookies);
  const marker = `smoke-profile-drift-${Date.now()}`;
  const postId = sqlOne('SELECT id FROM posts LIMIT 1;');

  if (postId) {
    const { res: cr, json: cj } = await fetchJson('/reports', {
      method: 'POST',
      cookies: csrfCookies,
      csrfToken,
      body: {
        targetType: 'POST',
        targetId: postId,
        reason: 'SPAM',
        details: marker,
      },
    });
    if (!cr.ok) {
      record('fixture report create', 'SKIP', `HTTP ${cr.status}`);
    } else {
      const { res, json } = await fetchJson('/admin/reports?limit=20', {
        cookies: adminCookies,
      });
      const row = (json?.data ?? []).find(
        (r) => r.id === cj?.id || r.details === marker,
      );
      if (!res.ok)
        record(
          'admin reports reporter.profile (fixture)',
          'FAIL',
          `HTTP ${res.status}`,
        );
      else if (!row)
        record(
          'admin reports reporter.profile (fixture)',
          'FAIL',
          'report missing in admin list',
        );
      else if (!reporterShapeOk(row))
        record(
          'admin reports reporter.profile (fixture)',
          'FAIL',
          'missing reporter.profile.username',
        );
      else
        record(
          'admin reports reporter.profile (fixture)',
          'PASS',
          `@${row.reporter.profile.username}`,
        );
    }
  } else {
    record('admin reports reporter.profile (fixture)', 'SKIP', 'no posts');
  }

  const ownerRow = sqlOne(
    `SELECT u.email || '|' || po.id FROM posts po JOIN profiles pr ON pr.id = po."profileId" JOIN users u ON u.id = pr."userId" LEFT JOIN qna_boxes qb ON qb."postId" = po.id WHERE qb.id IS NULL LIMIT 1;`,
  );
  if (!ownerRow.includes('|')) {
    record(
      'interactive qna/:id (fixture)',
      'SKIP',
      'no post without existing QnA box',
    );
  } else {
    const [ownerEmail, ownedPostId] = ownerRow.split('|');
    try {
      const ownerCookies = await loginPlatformUser(ownerEmail);
      const { csrfToken: ownerCsrf, cookies: ownerCsrfCookies } =
        await ensureCsrf(ownerCookies);
      const { res: boxRes, json: box } = await fetchJson('/interactive/qna', {
        method: 'POST',
        cookies: ownerCsrfCookies,
        csrfToken: ownerCsrf,
        body: { postId: ownedPostId, prompt: marker },
      });
      if (!boxRes.ok) {
        record(
          'interactive qna/:id (fixture)',
          'FAIL',
          `create HTTP ${boxRes.status}`,
        );
      } else {
        const { res: ansRes } = await fetchJson('/interactive/qna/answer', {
          method: 'POST',
          cookies: csrfCookies,
          csrfToken,
          body: { qnaBoxId: box.id, answerText: 'smoke answer text' },
        });
        if (!ansRes.ok) {
          record(
            'interactive qna/:id (fixture)',
            'FAIL',
            `answer HTTP ${ansRes.status}`,
          );
        } else {
          const { res: getRes, json: qna } = await fetchJson(
            `/interactive/qna/${box.id}`,
          );
          if (!getRes.ok)
            record(
              'interactive qna/:id (fixture)',
              'FAIL',
              `GET HTTP ${getRes.status}`,
            );
          else {
            const ans = qna?.answers?.[0];
            if (!ans?.user?.username || ans.user.username === 'usuario') {
              record(
                'interactive qna/:id (fixture)',
                'FAIL',
                `bad username: ${ans?.user?.username}`,
              );
            } else {
              record(
                'interactive qna/:id (fixture)',
                'PASS',
                `@${ans.user.username}`,
              );
            }
          }
        }
      }
    } catch (e) {
      record('interactive qna/:id (fixture)', 'FAIL', e.message);
    }
  }

  const recipientId = sqlOne(
    `SELECT p.id FROM profiles p JOIN users u ON u.id = p."userId" WHERE u.email <> '${USER_EMAIL.replace(/'/g, "''")}' LIMIT 1;`,
  );
  if (!recipientId) {
    record('chat edit message (fixture)', 'SKIP', 'no recipient profile');
  } else {
    const { res: sendRes, json: sent } = await fetchJson('/chat/messages', {
      method: 'POST',
      cookies: csrfCookies,
      csrfToken,
      body: { recipientId, content: marker },
    });
    if (!sendRes.ok) {
      record(
        'chat edit message (fixture)',
        'SKIP',
        `send HTTP ${sendRes.status}`,
      );
    } else {
      const { res: editRes, json: edited } = await fetchJson(
        `/chat/messages/${sent.id}`,
        {
          method: 'PUT',
          cookies: csrfCookies,
          csrfToken,
          body: { content: `${marker}-edited` },
        },
      );
      if (!editRes.ok)
        record(
          'chat edit message (fixture)',
          'FAIL',
          `edit HTTP ${editRes.status}`,
        );
      else if (!edited?.sender?.username) {
        record(
          'chat edit message (fixture)',
          'FAIL',
          'missing sender.username on edit response',
        );
      } else {
        record(
          'chat edit message (fixture)',
          'PASS',
          `@${edited.sender.username}`,
        );
      }
    }
  }
}

async function main() {
  console.log(`API base: ${BASE}\n`);

  // Health
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) {
    record('health', 'FAIL', `HTTP ${health.status}`);
    summarize();
    process.exit(1);
  }
  record('health', 'PASS');

  let adminCookies;
  try {
    adminCookies = await adminLogin();
    record('admin login + MFA', 'PASS');
  } catch (e) {
    record('admin login + MFA', 'FAIL', e.message);
    summarize();
    process.exit(1);
  }

  // Admin reports
  {
    const { res, json } = await fetchJson('/admin/reports?limit=5', {
      cookies: adminCookies,
    });
    if (!res.ok) {
      record('admin reports', 'FAIL', `HTTP ${res.status}`);
    } else {
      const rows = json?.data ?? [];
      const human = rows.filter(
        (r) => !r.details?.includes?.('[AI Automated Flag]'),
      );
      const bad = human.filter((r) => r.reporter && !reporterShapeOk(r));
      if (bad.length) {
        record(
          'admin reports reporter.profile',
          'FAIL',
          `${bad.length} row(s) missing profile.username`,
        );
      } else if (human.length === 0) {
        record(
          'admin reports reporter.profile',
          'SKIP',
          'no human reports in sample',
        );
      } else {
        record(
          'admin reports reporter.profile',
          'PASS',
          `${human.length} checked`,
        );
      }
    }
  }

  // Admin transactions
  {
    const { res, json } = await fetchJson('/admin/transactions?limit=10', {
      cookies: adminCookies,
    });
    if (!res.ok) {
      record('admin transactions', 'FAIL', `HTTP ${res.status}`);
    } else {
      const rows = json?.data ?? [];
      const bad = rows.filter((tx) => tx.sender && !txPartiesOk(tx));
      if (bad.length) {
        record(
          'admin transactions sender.profile',
          'FAIL',
          `${bad.length} still profiles[] shape`,
        );
      } else if (rows.length === 0) {
        record('admin transactions sender.profile', 'SKIP', 'empty ledger');
      } else {
        record(
          'admin transactions sender.profile',
          'PASS',
          `${rows.length} row(s)`,
        );
      }
    }
  }

  // Admin content tabs (shape)
  const adminListChecks = [
    ['/admin/comments?limit=3', 'comments'],
    ['/admin/stories?limit=3', 'stories'],
    ['/admin/moderation/queue?limit=3', 'moderation queue'],
    ['/admin/promotions?limit=3', 'promotions'],
    ['/admin/live?limit=3', 'live streams'],
  ];
  for (const [path, label] of adminListChecks) {
    const { res, json } = await fetchJson(path, { cookies: adminCookies });
    if (!res.ok) {
      record(`admin ${label}`, 'FAIL', `HTTP ${res.status}`);
      continue;
    }
    const rows = json?.data ?? json?.reports ?? [];
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      record(`admin ${label} user.profile`, 'SKIP', 'empty list');
      continue;
    }
    const bad = list.filter((row) => {
      if (label === 'live streams')
        return !row.host?.profile?.username && row.host;
      return (
        row.user !== undefined && row.user !== null && !hasAdminProfile(row)
      );
    });
    if (bad.length) {
      record(
        `admin ${label} user.profile`,
        'FAIL',
        `${bad.length}/${list.length} missing`,
      );
    } else {
      record(`admin ${label} user.profile`, 'PASS', `${list.length} row(s)`);
    }
  }

  // Appeals
  {
    const { res, json } = await fetchJson('/appeals/admin?limit=5', {
      cookies: adminCookies,
    });
    if (!res.ok) {
      record('admin appeals', 'FAIL', `HTTP ${res.status}`);
    } else {
      const rows = json?.data ?? [];
      const bad = rows.filter(
        (a) => a.user && !a.user.profile?.username && !a.user.email,
      );
      if (bad.length)
        record('admin appeals user.profile', 'FAIL', `${bad.length} bad`);
      else if (!rows.length)
        record('admin appeals user.profile', 'SKIP', 'empty');
      else
        record('admin appeals user.profile', 'PASS', `${rows.length} row(s)`);
    }
  }

  // User dossier
  {
    const { res: listRes, json: listJson } = await fetchJson(
      '/admin/users?limit=1',
      {
        cookies: adminCookies,
      },
    );
    if (!listRes.ok) {
      record('admin user dossier', 'FAIL', `users list HTTP ${listRes.status}`);
    } else {
      const userId = listJson?.data?.[0]?.id;
      if (!userId) {
        record('admin user dossier profile', 'SKIP', 'no users');
      } else {
        const { res, json } = await fetchJson(`/admin/users/${userId}/detail`, {
          cookies: adminCookies,
        });
        if (!res.ok)
          record('admin user dossier profile', 'FAIL', `HTTP ${res.status}`);
        else if (!json?.profile?.username)
          record(
            'admin user dossier profile',
            'FAIL',
            'missing profile.username',
          );
        else
          record(
            'admin user dossier profile',
            'PASS',
            `@${json.profile.username}`,
          );
      }
    }
  }

  // Creator monetization transactions
  let userCookies;
  try {
    const login = await userLogin();
    userCookies = login.cookies;
    record('platform user login', 'PASS', USER_EMAIL);
  } catch (e) {
    record('platform user login', 'FAIL', e.message);
    userCookies = null;
  }

  if (userCookies) {
    const { res, json } = await fetchJson(
      '/monetization/transactions?limit=10',
      {
        cookies: userCookies,
      },
    );
    if (!res.ok) {
      record('creator monetization transactions', 'FAIL', `HTTP ${res.status}`);
    } else {
      const rows = json?.data ?? [];
      record(
        'creator monetization transactions',
        'PASS',
        `${rows.length} row(s), no 500`,
      );
      const bad = rows.filter(
        (tx) => tx.sender?.profiles && !tx.sender?.profile,
      );
      if (bad.length)
        record(
          'creator tx sender.profile shape',
          'FAIL',
          `${bad.length} unmapped`,
        );
      else if (rows.length) record('creator tx sender.profile shape', 'PASS');
      else record('creator tx sender.profile shape', 'SKIP', 'empty');
    }

    await validateWithFixtures(adminCookies, userCookies);
  }

  summarize();
  process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
}

function summarize() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n--- Summary: ${pass} pass, ${skip} skip, ${fail} fail ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
