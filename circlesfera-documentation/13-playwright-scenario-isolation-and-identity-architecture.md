# Playwright Scenario Isolation and Test Identity Architecture — CircleSfera

> **Source of Truth:** This document defines the identity management, namespace isolation, and state segregation architecture for end-to-end (E2E) test automation across CircleSfera.

---

## 1. Scope and Problem Statement

In distributed web platforms and social networks, parallel E2E testing frequently encounters state pollution and race conditions when test suites share accounts, storage states, or database fixtures.

Common failure modes include:
1. **Shared Mutable Identity Interference**: Parallel workers logging into the same user simultaneously, mutating bios, invalidating active session tokens, or modifying profile settings concurrently.
2. **Handle and Email Collisions**: Multiple worker processes generating identities derived from millisecond timestamps (`Date.now()`), colliding in high-concurrency CI environments.
3. **Database State Leakage**: Tests asserting feed contents, follower graphs, or unread notification badges failing due to records created by sibling tests running in parallel.

CircleSfera resolves these challenges through a strict scenario-isolated identity architecture enforced across both root live journeys (`e2e/`) and frontend client suites (`circlesfera-frontend/e2e/`).

---

## 2. Foundational Architecture Principles

The E2E test identity architecture is built upon four foundational pillars:

### 2.1 Strict ADR-0015 Identity Split
Adhering to [ADR-0015](./adr/0015-user-profile-identity-split.md), test identities preserve the architectural separation between account credentials and social entities:
- `User`: Owns authentication credentials, passwords, session cookies, passkeys, and billing status.
- `Profile`: Owns handles (`username`), biographies, avatars, and follower graphs.
- E2E helpers generate atomic user-profile pairs where social interactions, posts, likes, and messages attach exclusively to `Profile.id`.

### 2.2 Process and Entropy-Salted Uniqueness
To prevent collisions across parallel workers sharing a PostgreSQL database, unique identifiers combine the worker process ID (`process.pid`) and cryptographic random bytes:

```typescript
export function uniqueSuffix(): string {
  return `${process.pid.toString(36)}${randomBytes(5).toString('hex')}`;
}
```

This guarantees that workers executing in parallel never generate overlapping usernames, emails, or session tokens.

### 2.3 Scenario-Scoped Namespacing
Every test journey specifies its scenario domain (e.g. `happy`, `social`, `chatsend`, `creator`, `settings`, `support`, `studio`). The username generator truncates and prefixes the handle:

```text
<scenario_prefix>_<pid_base36><random_hex>
Example: happy_1k4d9f8e21
```

This ensures full observability in database logs and prevents cross-scenario entity pollution while strictly respecting the 24-character handle constraint.

### 2.4 Ephemeral Storage State (Zero Shared Cookies)
No test suite shares `storageState.json` or pre-authenticated session files. Each test context is initialized with clean storage state (`storageState: { cookies: [], origins: [] }`) and registers its own isolated credentials, ensuring complete test independence.

---

## 3. Directory Layout and Helper Topology

```text
CircleSfera/
├── e2e/                                    # Root live full-stack journeys (against live Nest + Postgres)
│   ├── helpers/
│   │   ├── backend.ts                      # Direct database verification & API URLs
│   │   ├── factories.ts                    # Scenario-scoped account and payload factories
│   │   ├── session.ts                      # Isolated user registration, UI login, and onboarding
│   │   ├── teardown.ts                     # Global teardown hooks
│   │   └── unique.ts                       # Cryptographic suffix generation
│   ├── happy-path.spec.ts
│   ├── social.spec.ts
│   ├── chat.spec.ts
│   └── ...
└── circlesfera-frontend/e2e/               # Client-side component and composer visual regression
    ├── helpers/
    │   ├── composer.ts                     # Composer shell helpers and fixture uploads
    │   └── session.ts                      # Scenario user generator (createScenarioUser) & route stubs
    ├── composer-visual.spec.ts
    ├── feed.spec.ts
    ├── profile.spec.ts
    └── ...
```

---

## 4. Helper Implementation Reference

### 4.1 Root E2E Scenario Factories (`e2e/helpers/factories.ts`)

Provides type-safe scenario account generation for full-stack tests hitting live services:

```typescript
import { createScenarioAccount } from './helpers/factories.js';

// Produces a unique, scenario-namespaced account
const account = createScenarioAccount({
  scenario: 'social',
  role: 'USER',
  fullName: 'E2E Social Tester',
});
```

### 4.2 Seamless Session Integration (`e2e/helpers/session.ts`)

`enterAsNewUser` accepts optional scenario metadata and provisions an authenticated browser context:

```typescript
// Registers, confirms email in DB, completes onboarding, and signs in
const account = await enterAsNewUser(page, { scenario: 'happy' });

// Multi-user scenario isolation (e.g. Direct Messaging)
const sender = await enterAsNewUser(pageA, { scenario: 'chatsend' });
const recipient = await enterAsNewUser(pageB, { scenario: 'chatreceive' });
```

### 4.3 Frontend Scenario Isolation (`circlesfera-frontend/e2e/helpers/session.ts`)

For isolated React component and composer visual tests, `createScenarioUser` generates isolated mock identities that bind dynamically to API route stubs:

```typescript
// Isolates user profile, routes, and auth-storage state
const { user, profile } = await prepareAuthenticatedSession(page, {
  scenario: 'profile',
});

// User-specific route binding
await page.route(`**/api/v1/profiles/${user.username}`, async (route) => {
  await route.fulfill({ status: 200, json: profile });
});
```

---

## 5. Verification and Enforcement

1. **Automated Visual and Smoke Execution**: All 13 frontend Playwright tests run fully parallel (`fullyParallel: true`) without cross-test flakiness or state collisions.
2. **Deterministic Cleanup**: Test database cleanup tooling (`scripts/cleanup-e2e-users.ts`) identifies and safely prunes records ending with `@circlesfera.test` without touching production demo seeds.
3. **No Global Mutation**: Every spec creates, mutates, and verifies only entities belonging to its own scenario-isolated identity.
