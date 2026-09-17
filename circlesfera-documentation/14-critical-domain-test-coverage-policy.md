# Critical-Domain Test Coverage and Quality Assurance Policy — CircleSfera

> **Source of Truth:** This document defines the risk-based test coverage thresholds, domain boundaries, and continuous integration enforcement policies across CircleSfera.

---

## 1. Scope and Purpose

Test coverage across production services must reflect operational and financial risk. While blanket high coverage percentages on trivial boilerplate (such as static DTO declarations or pass-through adapters) create brittle suites, critical domains require rigorous, fail-closed verification.

Without explicit minimums on high-risk domains:
1. Critical security and authorization logic can decay during refactoring without failing CI.
2. Financial and billing computations (Stripe webhooks, fee deductions, creator balances) can suffer regressions.
3. User privacy, GDPR data extraction, and account deletion purgatory mechanisms can omit required data models.

CircleSfera enforces a two-tier coverage architecture:
- A **Global Baseline Floor** preventing macro regression across the entire server codebase.
- **Critical-Domain Risk-Based Minimums** enforcing strict statement and line thresholds on sensitive application boundaries.

---

## 2. Risk Domain Classifications

The backend architecture classifies server logic into four high-risk tiers:

### 2.1 Security and Authentication (`src/auth/**`)
- **Scope:** Credential validation, argon2 hashing, JWT access/refresh token rotation, two-factor authentication (TOTP), WebAuthn passkey registration/authentication, CSRF validation, and password reset flows.
- **Risk Profile:** Unauthorized account access, credential stuffing, privilege escalation.
- **Minimum Thresholds:** **65% Statements / 65% Lines**.

### 2.2 Authorization and Access Control
- **Administrative RBAC (`src/auth/guards/admin.guard.ts`):**
  - **Scope:** Platform-wide role permissions (`SUPER_ADMIN`, `SUPPORT`, `MODERATOR`, `FINANCE`).
  - **Risk Profile:** Administrative account impersonation, unauthorized operational actions.
  - **Minimum Thresholds:** **90% Statements / 90% Lines**.
- **Resource Ownership (`src/auth/guards/ownership.guard.ts`):**
  - **Scope:** Horizontal access control validating that callers own target resources (posts, stories, collections, comments).
  - **Risk Profile:** Insecure Direct Object Reference (IDOR), unauthorized deletion or mutation.
  - **Minimum Thresholds:** **75% Statements / 75% Lines**.

### 2.3 Payments and Monetization
- **Payments Processing (`src/payments/**`):**
  - **Scope:** Stripe checkout session creation, webhook signature verification, invoice tracking, subscription entitlements, and checkout idempotency.
  - **Risk Profile:** Unfulfilled orders, bypassed payment gates, duplicate charging.
  - **Minimum Thresholds:** **45% Statements / 45% Lines**.
- **Monetization Engine (`src/monetization/**`):**
  - **Scope:** Creator economy balances, tipping transactions, paid messaging, paywalled post unlocking, and 20% platform fee calculation (ADR-0010).
  - **Risk Profile:** Financial accounting drift, incorrect fee distribution, creator balance corruption.
  - **Minimum Thresholds:** **30% Statements / 30% Lines**.

### 2.4 Data Lifecycle and Privacy
- **GDPR Personal Data Export (`src/users/services/data-export.service.ts`):**
  - **Scope:** Complete personal data extraction across all relational models, media packaging, and ZIP assembly.
  - **Risk Profile:** Statutory non-compliance with GDPR Article 15/20 data portability regulations.
  - **Minimum Thresholds:** **85% Statements / 85% Lines**.
- **User Hard Deletion (`src/users/processors/user-deletion.processor.ts`):**
  - **Scope:** Cascading hard-deletion purge, GDPR 30-day purgatory completion, media asset deletion, and identity anonymization.
  - **Risk Profile:** Residual personal data retention, orphaned database records, incomplete file removal.
  - **Minimum Thresholds:** **60% Statements / 60% Lines**.
- **Transactional Outbox (`src/outbox/**`):**
  - **Scope:** Outbox database record generation, reliable event dispatch, dual-write prevention, and BullMQ worker queue relays.
  - **Risk Profile:** Lost domain events, unsynchronized downstream state, notification delivery failure.
  - **Minimum Thresholds:** **80% Statements / 80% Lines**.

---

## 3. Threshold Matrix Summary

| Domain / Target Component | Path Pattern | Minimum Lines | Minimum Statements | CI Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| **Global Backend Baseline** | Global (`**`) | **45%** | **45%** | `npm run test:cov` |
| **Security & Auth Domain** | `src/auth/**` | **65%** | **65%** | `npm run test:cov` |
| **Admin RBAC Authorization** | `src/auth/guards/admin.guard.ts` | **100%** | **100%** | `npm run test:cov` |
| **Resource Ownership Guard** | `src/auth/guards/ownership.guard.ts` | **100%** | **100%** | `npm run test:cov` |
| **Two-Factor Auth Service** | `src/auth/two-factor/two-factor.service.ts` | **100%** | **100%** | `npm run test:cov` |
| **Two-Factor Controller** | `src/auth/two-factor/two-factor.controller.ts` | **100%** | **100%** | `npm run test:cov` |
| **Stripe Webhook Secret Security** | `src/common/stripe/stripe-webhook-secrets.ts` | **100%** | **100%** | `npm run test:cov` |
| **User Hard-Deleted Domain Event** | `src/users/events/user-hard-deleted.event.ts` | **100%** | **100%** | `npm run test:cov` |
| **Payments Processing** | `src/payments/**` | **45%** | **45%** | `npm run test:cov` |
| **Monetization Engine** | `src/monetization/**` | **30%** | **30%** | `npm run test:cov` |
| **GDPR Data Export** | `src/users/services/data-export.service.ts` | **85%** | **85%** | `npm run test:cov` |
| **User Deletion Lifecycle** | `src/users/processors/user-deletion.processor.ts` | **60%** | **60%** | `npm run test:cov` |
| **Transactional Outbox** | `src/outbox/**` | **80%** | **80%** | `npm run test:cov` |

---

## 4. Continuous Integration Enforcement

### 4.1 CI Quality Gate
In `.github/workflows/ci-quality.yml`, the backend verification step runs:
```bash
cd circlesfera-backend
npm run test:cov
```

Under Vitest with V8 coverage enabled, Vitest calculates coverage summaries for all matching files and evaluates each against configured thresholds.

### 4.2 Failure Behavior
If any configured threshold is not satisfied, Vitest prints an explicit error and terminates with exit code `1`:
```text
ERROR: Coverage for lines (80.55%) does not meet "src/auth/guards/ownership.guard.ts" threshold (99%)
ERROR: Coverage for statements (80.55%) does not meet "src/auth/guards/ownership.guard.ts" threshold (99%)
```
This halts the CI pipeline, preventing pull request merges and deployment promotions until test coverage is reinstated.

---

## 5. Local Developer Workflow

To run the full suite with threshold verification locally:
```bash
# From repository root
npm run backend:cov

# Or within the backend workspace
cd circlesfera-backend
npm run test:cov
```

To run a specific spec file while retaining threshold checks:
```bash
cd circlesfera-backend
npx vitest run --coverage src/auth/guards/admin.guard.spec.ts
```
