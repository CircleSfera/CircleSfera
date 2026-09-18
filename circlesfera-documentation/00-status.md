# CircleSfera: Implementation Status

> **Source of Truth:** This document reflects the actual state of code implementation in the repository.
> If code exists that is not mentioned here, this document must be updated. If an AI agent attempts to
> interact with a module listed as *Out of Scope* or that does not exist, it must stop and request confirmation.

## 🟢 Shipped (Production / Completed)
The following modules are implemented, QA-tested, secured, and their architectural boundaries are mechanically verified.

### Backend
- **Core Architecture:** Modular monolith built with NestJS, Prisma (PostgreSQL), and BullMQ.
- **Security:** Strict Helmet configuration (HSTS, CSP, CORP), double-submit CSRF, `express-rate-limit`, Cloudflare Turnstile bot verification, and strict DTO validation (`whitelist: true`, `forbidNonWhitelisted: true`).
- **Dependency Security & Vulnerability Policy:** Continuous vulnerability scanning across all workspaces (root, backend, frontend, shared), formal remediation SLAs (Critical $\le 24$h, High $\le 7$d), structured exception governance with expiration enforcement (`.dependency-security-exceptions.json`), and automated blocking CI gates (`npm run audit:deps`). Details in [10-dependency-vulnerability-and-update-policy.md](10-dependency-vulnerability-and-update-policy.md).
- **Dependency Provenance & Lockfile Integrity:** Multi-workspace lockfile synchronization, cryptographic SHA-512 integrity verification, package signature and attestation audits, and strict immutable installation enforcement (`npm ci`) across CI workflows and Docker container builds. Automated audit tooling via `npm run verify:lockfiles`. Details in [12-dependency-provenance-and-lockfile-integrity.md](12-dependency-provenance-and-lockfile-integrity.md).
- **Authentication:** JWT session system with `httpOnly` cookies, multi-factor authentication (2FA/TOTP), and WebAuthn Passkeys.
- **Identity Architecture:** Separation of `User` (credentials and billing account) vs. `Profile` (social entity and interaction persona), adhering to [ADR-0015](adr/0015-user-profile-identity-split.md).
- **Real-Time:** Socket.io horizontally scalable with Redis Adapter, with token-authenticated `events` namespace.
- **Monetization (Stripe):** Creator subscriptions, pay-per-view, tips, secure webhooks, and backend-enforced catalog pricing without client-supplied amounts ([ADR-0010](adr/0010-platform-fee-20-percent.md)).
- **Transaction Boundaries & Concurrency Invariants:** Multi-layered defense-in-depth model combining database unique constraints, atomic optimistic webhook leasing with P2002 race resolution, interactive multi-operation ACID transactions (`$transaction`), and durable background reconciliation. Validated through automated unit and integration concurrency tests. Details in [15-transaction-boundaries-and-concurrency-invariants.md](15-transaction-boundaries-and-concurrency-invariants.md).

### Frontend
- **Architecture:** React SPA with Vite, code-split route lazy loading (`BrowserRouter`), and segregated state stores (TanStack Query for server cache, 11 `zustand` stores for client state).
- **API Consumption:** Unified HTTP client (`ApiClient`) with interceptors for automatic JWT rotation and CSRF synchronization.
- **State Decoupling:** Zustand stores (such as `socketStore`) do not manage lifecycle; they reactively expose state provided by their respective services (`realtime.service.ts`).
- **Mobile-First Design:** Viewports prioritized at 390×844px (iPhone 15 Pro), scaled components without distortion, dense content-focused UI (inspired by Meta/Threads).

### Quality Assurance & Testing
- **Test Data Factories & Scenario Seeding:** Deterministic, type-safe entity factories and composite scenario seeders across backend and root E2E suites. ADR-0015 identity split enforcement, collision-free process suffixes, cached argon2 hashing, binary fixtures (PNG, JPEG, MP4), and isolated per-scenario cleanup callbacks. Details in [11-test-data-factories-and-scenario-seeding.md](11-test-data-factories-and-scenario-seeding.md).
- **Test Topology & Legacy Suite Purge:** Three-tier testing architecture enforcing strict layer separation: Root E2E (`e2e/`) against live NestJS + PostgreSQL + Redis with zero stubs, Frontend Playwright (`circlesfera-frontend/e2e/`) for isolated UI visual regression, and Backend E2E (`circlesfera-backend/test/`) for API integration. Legacy ignored mock suites (`e2e/tests/`) and orphan fixtures have been completely removed, ensuring 100% active, non-skipped test execution.
- **Playwright Scenario Isolation & State Architecture:** Complete elimination of shared mutable test identities across root live journeys and frontend client suites. Process-entropy salting (`process.pid`), scenario-scoped namespacing (`createScenarioAccount`, `createScenarioUser`), ephemeral storage state (`storageState: { cookies: [], origins: [] }`), and ADR-0015 identity split enforcement. Details in [13-playwright-scenario-isolation-and-identity-architecture.md](13-playwright-scenario-isolation-and-identity-architecture.md).
- **Critical-Domain Test Coverage & CI Enforcement:** Two-tier test coverage architecture establishing risk-based minimum thresholds across high-risk server domains (Security `src/auth/**` 65%, Admin Authorization `admin.guard.ts` 90%, Resource Ownership `ownership.guard.ts` 75%, Payments `src/payments/**` 45%, Monetization `src/monetization/**` 30%, GDPR Data Export `data-export.service.ts` 85%, User Deletion Lifecycle `user-deletion.processor.ts` 60%, Transactional Outbox `src/outbox/**` 80%) alongside a global baseline floor of 45%. Mechanically enforced in CI via `npm run test:cov`. Details in [14-critical-domain-test-coverage-policy.md](14-critical-domain-test-coverage-policy.md).
- **Security Regression Suite & Vulnerability Prevention:** Dedicated automated test suite permanently protecting against regressions across all resolved P0/P1 security findings: fail-closed plaintext password rejection, strict hash verification, elimination of hardcoded JWT fallback secrets, RFC 6819 refresh token family reuse detection, stateful WebRTC call signaling authorization, GDPR export artifact HMAC protection and cross-user isolation, and pay-per-view media access control. Validated via `src/common/testing/security-regression.spec.ts`. Details in [16-security-regression-suite-and-vulnerability-prevention.md](16-security-regression-suite-and-vulnerability-prevention.md).

### Infrastructure
- **Nginx (Master Proxy):** Production environments (`circlesfera.com`, `api.*`, `admin.*`) with HSTS. Development environment (`dev.*`) secured behind HTTP Basic Auth with strict bypass rules for Stripe webhooks and health probes. Conservative bounded timeouts ($\le 60$s) and proxy buffering enabled on standard REST API routes, with explicit scoped exceptions for uploads (100MB, unbuffered), WebSockets (3600s keepalive), and GDPR export streaming. Details in [08-nginx-traffic-and-buffering-policy.md](08-nginx-traffic-and-buffering-policy.md).
- **Docker Compose & Container Provenance:** Full service orchestration for frontend, backend, PostgreSQL (`pgvector`), and Redis. All base images and third-party infrastructure services are cryptographically pinned to immutable multi-architecture `@sha256:` digests across Dockerfiles, Compose manifests, and CI workflows, eliminating supply chain drift. Automated static verification via `npm run docker:verify-digests`. Details in [09-container-image-provenance-and-digests.md](09-container-image-provenance-and-digests.md).
- **Backup & Disaster Recovery:** Formalized SLAs (RPO $\le 24$h core, RPO = 0 financial ledger, cold RTO $\le 30$m). Automated logical dumps (`backup-postgres.sh`), restore tooling (`restore-postgres.sh`), unattended restore drill verification (`verify-backup-restore.sh`), and daily 02:00 UTC cron with 30-day retention and S3 off-host replication. Details in [05-disaster-recovery.md](05-disaster-recovery.md).
- **Backward-Compatible Migrations & Rollback:** Mandatory Expand/Contract schema discipline ensuring compatibility between application version $N-1$ and schema version $N$. Static breaking change linter (`lint-migration-safety.mjs`), reversible `down.sql` scripts, and isolated rollback drill testing (`test-migration-rollback.sh`). Details in [06-migration-rollback-policy.md](06-migration-rollback-policy.md).
- **Production Change Control:** Strict `main` branch protection enforcing peer reviews, stale review dismissal, conversation thread resolution, required CI Quality and Playwright smoke status checks, and gated deployments to OVH VPS. Audit tooling via `npm run repo:verify-protection`. Details in [07-production-change-control.md](07-production-change-control.md).

## 🟡 In Development (Transition)
- **Technical Documentation:** Definitive system architecture, entity relationship models ([02-database-er-diagram.md](02-database-er-diagram.md)), and functional user stories ([04-user-stories.md](04-user-stories.md)) are synchronized with `schema.prisma` and live API controllers.

## 🔴 Out of Scope (Explicitly Not Implemented)
- Separate microservices (splitting the modular monolith without an approved ADR is strictly forbidden).
- Domain event bus libraries (`EventEmitter2`, CQRS event sourcing). Do not attempt to introduce them.
- GraphQL. The entire public and private API is strictly REST with lean controllers.
- JWT storage in client `localStorage` (strictly HTTP-only secure cookies).
- Native mobile applications (CircleSfera is mobile-first responsive web/PWA).
