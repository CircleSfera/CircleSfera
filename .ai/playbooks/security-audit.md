# Playbook — Security and privacy audit

Specialists: `security` → `backend` → `api` → `privacy-compliance` → `code-reviewer`. Add
`payments` for money paths and `trust-and-safety` for moderation surfaces.

Use this both for a scoped review (one module, one flow) and for a periodic sweep. Always state the
scope you actually covered — a partial audit presented as complete is worse than no audit.

## 1 — Define the scope

Name the surface: which module, which endpoints, which data. Then read the current posture in
[`../agents/security.md`](../agents/security.md) so you audit against how the system is actually built
rather than a generic checklist.

## 2 — Enumerate the surface

For the scope, list:

- Every endpoint, with its guards, DTO and response shape.
- Every field a client can set, and whether any of them is privileged (`role`, `verificationLevel`,
  `isPremium`, `priceCents`, `moderationStatus`, `status`, ids of other users).
- Every id accepted from the client, and where it is authorized.
- Every socket event emitted, and to which room.
- Every queue job triggered, and what it does with the payload.
- Every piece of personal data read, written, logged or returned.

## 3 — Audit

**Authentication and session**

- Cookie-based auth intact: httpOnly `access_token`, rotating `refresh_token` persisted in
  `RefreshToken`.
- Suspension and ban enforced (`suspendedUntil`, `isActive`) at login and in the JWT strategy.
- No token reachable from JavaScript.

**Authorization**

- Every endpoint has a deliberate decision; public is a decision.
- Ownership checked in the service for every mutation — there is no generic ownership guard.
- IDOR: every client-supplied id authorized against the caller.
- Privilege escalation: `USER` → admin data, `MODERATOR` beyond declared
  `@RequireStaffPermissions`, privileged fields settable via DTO.
- Plan and KYC gating where it applies (`SubscriptionGuard` + `@RequiresPlan`,
  `IdentityVerifiedGuard`).

**Input and output**

- DTOs validated; `whitelist` and `forbidNonWhitelisted` not weakened.
- Uploads validated server-side for type and size.
- Responses expose only what the client needs; no `password`, tokens, other users' emails, moderation
  internals, or locked premium media.

**Injection and rendering**

- Raw SQL parameterized; user content safe in email templates and any HTML path.

**Abuse**

- Rate limiting on auth, search, uploads, messaging, reporting, promotion views.
- New user-generated surfaces have a report path, and honour `Block` and `Mute`.

**Secrets**

- Config/env only. Nothing hardcoded, logged or returned. Production fail-fast preserved.

**Privacy**

- Purpose, minimization and retention for any new personal data.
- Export coverage (`DataExportRequest`) and deletion coverage, verified against Prisma `onDelete`.
- Consent gate respected for telemetry.
- No new third-party processor without confirmation.

**Money** (if in scope)

- Amounts computed server-side; fee and the 80% ledger credit agree; webhooks idempotent;
  entitlement verified server-side.

## 4 — Confirm each finding

For every finding, write the concrete exploit path in one or two sentences and confirm it in the code —
file and line. A theoretical finding with no path is noise, and noise buries the real ones.

Severity: **Critical** (auth bypass, data exposure, money loss, personal-data leak) / **High** /
**Medium** / **Low**.

## 5 — Fix

Fix Critical and High immediately; propose the rest. Each fix is the minimal correct change, with a
test covering the **deny** path. Never weaken a guard, validation rule, throttle or CSRF exclusion to
make something work.

If a fix affects privacy, compliance or data integrity, stop and warn before implementing — `AGENTS.md`
requires it.

## 6 — Report

- **Scope covered**, and explicitly what was not covered.
- **Findings** by severity: file, line, exploit path, fix.
- **Fixes applied** and tests added, with real command output.
- **Residual risk** and anything needing a human decision.
- **Docs:** update `06-security-privacy-compliance.md` if the posture changed.

Close with [`../checklists/security.md`](../checklists/security.md).
