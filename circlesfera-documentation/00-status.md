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
- **Authentication:** JWT session system with `httpOnly` cookies, multi-factor authentication (2FA/TOTP), and WebAuthn Passkeys.
- **Identity Architecture:** Separation of `User` (credentials and billing account) vs. `Profile` (social entity and interaction persona), adhering to [ADR-0015](adr/0015-user-profile-identity-split.md).
- **Real-Time:** Socket.io horizontally scalable with Redis Adapter, with token-authenticated `events` namespace.
- **Monetization (Stripe):** Creator subscriptions, pay-per-view, tips, secure webhooks, and backend-enforced catalog pricing without client-supplied amounts ([ADR-0010](adr/0010-platform-fee-20-percent.md)).

### Frontend
- **Architecture:** React SPA with Vite, code-split route lazy loading (`BrowserRouter`), and segregated state stores (TanStack Query for server cache, 11 `zustand` stores for client state).
- **API Consumption:** Unified HTTP client (`ApiClient`) with interceptors for automatic JWT rotation and CSRF synchronization.
- **State Decoupling:** Zustand stores (such as `socketStore`) do not manage lifecycle; they reactively expose state provided by their respective services (`realtime.service.ts`).
- **Mobile-First Design:** Viewports prioritized at 390×844px (iPhone 15 Pro), scaled components without distortion, dense content-focused UI (inspired by Meta/Threads).

### Quality Assurance & Testing
- **Test Data Factories & Scenario Seeding:** Deterministic, type-safe entity factories and composite scenario seeders across backend and root E2E suites. ADR-0015 identity split enforcement, collision-free process suffixes, cached argon2 hashing, binary fixtures (PNG, JPEG, MP4), and isolated per-scenario cleanup callbacks. Details in [11-test-data-factories-and-scenario-seeding.md](11-test-data-factories-and-scenario-seeding.md).

### Infrastructure
- **Nginx (Master Proxy):** Production environments (`circlesfera.com`, `api.*`, `admin.*`) with HSTS. Development environment (`dev.*`) secured behind HTTP Basic Auth with strict bypass rules for Stripe webhooks and health probes. Conservative bounded timeouts ($\le 60$s) and proxy buffering enabled on standard REST API routes, with explicit scoped exceptions for uploads (100MB, unbuffered), WebSockets (3600s keepalive), and GDPR export streaming. Details in [08-nginx-traffic-and-buffering-policy.md](08-nginx-traffic-and-buffering-policy.md).
- **Docker Compose & Container Provenance:** Full service orchestration for frontend, backend, PostgreSQL (`pgvector`), and Redis. All base images and third-party infrastructure services are cryptographically pinned to immutable multi-architecture `@sha256:` digests across Dockerfiles, Compose manifests, and CI workflows, eliminating supply chain drift. Automated static verification via `npm run docker:verify-digests`. Details in [09-container-image-provenance-and-digests.md](09-container-image-provenance-and-digests.md).
- **Backup & Disaster Recovery:** Formalized SLAs (RPO $\le 24$h core, RPO = 0 financial ledger, cold RTO $\le 30$m). Automated logical dumps (`backup-postgres.sh`), restore tooling (`restore-postgres.sh`), unattended restore drill verification (`verify-backup-restore.sh`), and daily 02:00 UTC cron with 30-day retention and S3 off-host replication. Details in [05-disaster-recovery.md](05-disaster-recovery.md).
- **Backward-Compatible Migrations & Rollback:** Mandatory Expand/Contract schema discipline ensuring compatibility between application version $N-1$ and schema version $N$. Static breaking change linter (`lint-migration-safety.mjs`), reversible `down.sql` scripts, and isolated rollback drill testing (`test-migration-rollback.sh`). Details in [06-migration-rollback-policy.md](06-migration-rollback-policy.md).
- **Production Change Control:** Strict `main` branch protection enforcing peer reviews, stale review dismissal, conversation thread resolution, required CI Quality and Playwright smoke status checks, and gated deployments to OVH VPS. Audit tooling via `npm run repo:verify-protection`. Details in [07-production-change-control.md](07-production-change-control.md).

## 🟡 In Development (Transition)
- **Technical Documentation:** Authoring definitive system schemas and retiring legacy exploratory drafts.

## 🔴 Out of Scope (Explicitly Not Implemented)
- Separate microservices (splitting the modular monolith without an approved ADR is strictly forbidden).
- Domain event bus libraries (`EventEmitter2`, CQRS event sourcing). Do not attempt to introduce them.
- GraphQL. The entire public and private API is strictly REST with lean controllers.
- JWT storage in client `localStorage` (strictly HTTP-only secure cookies).
- Native mobile applications (CircleSfera is mobile-first responsive web/PWA).
