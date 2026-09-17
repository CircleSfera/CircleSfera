# CircleSfera: Implementation Status

> **Source of Truth:** This document reflects the actual state of code implementation in the repository.
> If code exists that is not mentioned here, this document must be updated. If an AI agent attempts to
> interact with a module listed as *Out of Scope* or that does not exist, it must stop and request confirmation.

## 🟢 Shipped (Production / Completed)
The following modules are implemented, QA-tested, secured, and their architectural boundaries are mechanically verified.

### Backend
- **Core Architecture:** Modular monolith built with NestJS, Prisma (PostgreSQL), and BullMQ.
- **Security:** Strict Helmet configuration (HSTS, CSP, CORP), double-submit CSRF, `express-rate-limit`, Cloudflare Turnstile bot verification, and strict DTO validation (`whitelist: true`, `forbidNonWhitelisted: true`).
- **Authentication:** JWT session system with `httpOnly` cookies, multi-factor authentication (2FA/TOTP), and WebAuthn Passkeys.
- **Identity Architecture:** Separation of `User` (credentials and billing account) vs. `Profile` (social entity and interaction persona), adhering to [ADR-0015](adr/0015-user-profile-identity-split.md).
- **Real-Time:** Socket.io horizontally scalable with Redis Adapter, with token-authenticated `events` namespace.
- **Monetization (Stripe):** Creator subscriptions, pay-per-view, tips, secure webhooks, and backend-enforced catalog pricing without client-supplied amounts ([ADR-0010](adr/0010-platform-fee-20-percent.md)).

### Frontend
- **Architecture:** React SPA with Vite, code-split route lazy loading (`BrowserRouter`), and segregated state stores (TanStack Query for server cache, 11 `zustand` stores for client state).
- **API Consumption:** Unified HTTP client (`ApiClient`) with interceptors for automatic JWT rotation and CSRF synchronization.
- **State Decoupling:** Zustand stores (such as `socketStore`) do not manage lifecycle; they reactively expose state provided by their respective services (`realtime.service.ts`).
- **Mobile-First Design:** Viewports prioritized at 390×844px (iPhone 15 Pro), scaled components without distortion, dense content-focused UI (inspired by Meta/Threads).

### Infrastructure
- **Nginx (Master Proxy):** Production environments (`circlesfera.com`, `api.*`, `admin.*`) with HSTS. Development environment (`dev.*`) secured behind HTTP Basic Auth with strict bypass rules for Stripe webhooks and health probes.
- **Docker Compose:** Full service orchestration for frontend, backend, PostgreSQL (`pgvector`), and Redis.
- **Backup & Disaster Recovery:** Formalized SLAs (RPO $\le 24$h core, RPO = 0 financial ledger, cold RTO $\le 30$m). Automated logical dumps (`backup-postgres.sh`), restore tooling (`restore-postgres.sh`), unattended restore drill verification (`verify-backup-restore.sh`), and daily 02:00 UTC cron with 30-day retention and S3 off-host replication. Details in [05-disaster-recovery.md](05-disaster-recovery.md).
- **Backward-Compatible Migrations & Rollback:** Mandatory Expand/Contract schema discipline ensuring compatibility between application version $N-1$ and schema version $N$. Static breaking change linter (`lint-migration-safety.mjs`), reversible `down.sql` scripts, and isolated rollback drill testing (`test-migration-rollback.sh`). Details in [06-migration-rollback-policy.md](06-migration-rollback-policy.md).

## 🟡 In Development (Transition)
- **Technical Documentation:** Authoring definitive system schemas and retiring legacy exploratory drafts.

## 🔴 Out of Scope (Explicitly Not Implemented)
- Separate microservices (splitting the modular monolith without an approved ADR is strictly forbidden).
- Domain event bus libraries (`EventEmitter2`, CQRS event sourcing). Do not attempt to introduce them.
- GraphQL. The entire public and private API is strictly REST with lean controllers.
- JWT storage in client `localStorage` (strictly HTTP-only secure cookies).
- Native mobile applications (CircleSfera is mobile-first responsive web/PWA).
