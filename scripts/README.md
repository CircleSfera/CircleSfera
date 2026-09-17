# Operational and Support Scripts — CircleSfera

Collection of automation, database, diagnostic, deployment, verification, and documentation tools for CircleSfera.

---

## 1. Script Matrix

| Command / Script | Environment | Purpose | Risk Level |
| :--- | :--- | :--- | :--- |
| `npm run repo:verify-protection`<br>`node scripts/verify-branch-protection.mjs` | Local / CI | Audits GitHub branch protection rules on `main` (reviews, status checks, admin enforcement). | **Low** (Read-only) |
| `npm run repo:enforce-protection`<br>`node scripts/verify-branch-protection.mjs --enforce` | Local / CI | Synchronizes and enforces target branch protection rules on `main` via GitHub API. | **Medium** (Updates repo rules) |
| `npm run nginx:lint`<br>`node scripts/test-nginx-config.mjs` | Local / CI | Validates Nginx syntax, bounded defaults (60s), and scoped upload/streaming exceptions. | **Low** (Static analysis) |
| `npm run docker:verify-digests`<br>`node scripts/verify-container-digests.mjs` | Local / CI | Validates that all Dockerfiles, Compose manifests, and CI workflows specify immutable `@sha256:` digests. | **Low** (Static analysis) |
| `npm run audit:deps`<br>`node scripts/audit-dependencies.mjs` | Local / CI | Scans production dependencies across all workspaces, enforcing SLA thresholds and checking `.dependency-security-exceptions.json`. | **Low** (Static audit) |
| `npm run verify:lockfiles`<br>`node scripts/verify-lockfile-integrity.mjs` | Local / CI | Validates manifest-to-lockfile synchronization, SHA-512 hashes, and registry signatures across all workspaces. | **Low** (Static audit) |
| `npm run db:backup`<br>`./scripts/backup-postgres.sh` | VPS / Local | Logical PostgreSQL dump (`pg_dump -Fc`), TOC integrity validation, local retention, and optional S3 sync. | **Low** (Read-only) |
| `./scripts/backup-uploads.sh` | VPS / Local | Compressed archive (`.tar.gz`) of the uploaded media volume (`uploads/`) with retention and S3 sync. | **Low** (Read-only) |
| `npm run db:restore`<br>`./scripts/restore-postgres.sh` | VPS / Local | Restores a custom-format dump produced by `backup-postgres.sh`. Requires explicit `CONFIRM=YES`. | **High** (Destructive on target DB) |
| `npm run db:verify-restore`<br>`./scripts/verify-backup-restore.sh` | CI / Local / Ops | Automated DR drill: creates/receives dump, asserts TOC, restores to ephemeral DB, and verifies tables/migrations. | **Low** (Isolated in temp DB) |
| `./scripts/install-backup-cron.sh` | VPS (OVH) | Installs daily 02:00 UTC cron schedule on the production server using Docker Compose. | **Medium** (Updates `crontab`) |
| `npm run db:check-migrations`<br>`./scripts/check-prisma-schema-migrations.sh` | CI / Local | Detects drift between `schema.prisma` and physical Prisma migrations. | **Low** (Read-only against temp DB) |
| `npm run db:lint-migrations`<br>`node scripts/lint-migration-safety.mjs` | CI / Pre-commit | Audits destructive SQL statements (`DROP COLUMN`, `RENAME`, `SET NOT NULL`), enforcing Expand/Contract. | **Low** (Static analysis) |
| `npm run db:test-rollback`<br>`./scripts/test-migration-rollback.sh` | CI / Local / Ops | Simulates schema rollback in ephemeral DB by applying `down.sql` and verifying forward re-entrancy. | **Low** (Isolated in temp DB) |
| `./scripts/prisma-migrate-deploy.sh` | Prod Container | Executes `prisma migrate deploy` during startup with automated recovery from historical issues. | **Medium** (Applies migrations) |
| `npm run env:upload`<br>`./scripts/upload-prod-env.sh` | Local Ops | Validates critical secrets in `.env.production` and updates `ENV_PRODUCTION_B64` secret via `gh`. | **Medium** (Updates secrets) |
| `./scripts/setup-github-e2e.sh` | Local Ops | Configures E2E testing credentials and feature flags in GitHub Secrets/Variables. | **Low** (Configuration) |
| `npm run ops:diagnose-crypto`<br>`node scripts/diagnose-message-crypto.mjs` | Ops Container | Diagnoses AES-256-GCM encryption status of messages (`Message.content`) against key candidates. | **Low** (Read-only) |
| `npm run smoke:profile-drift`<br>`node scripts/validate-profile-drift-smoke.mjs` | Local / Post-deploy | HTTP smoke test verifying User vs Profile identity segregation contracts (ADR-0015). | **Low** (Controlled probes) |
| `npm run docs:api-inventory`<br>`node scripts/generate-api-inventory.mjs` | Local | Scans NestJS controllers statically and regenerates `circlesfera-documentation/03-api-catalog.generated.md`. | **Low** (Documentation) |
| `npm run backend:cov`<br>`npm run test:cov --prefix circlesfera-backend` | CI / Local | Runs backend unit tests with V8 coverage and enforces critical-domain thresholds. | **Low** (Test runner) |

---

## 2. Usage Guide by Domain

### A. Repository & Change Control Governance

#### `verify-branch-protection.mjs`
Audits and enforces branch protection rules on the `main` branch to guarantee production change control:
- Mandates at least 1 approving review with automatic dismissal of stale approvals.
- Enforces conversation resolution on all pull request threads.
- Enforces CI Quality and Playwright Smoke required status checks.
- Enforces protections on repository administrators.
- Blocks branch deletion and force pushes.

```bash
# Verify branch protection rules (returns exit code 0 on pass, 1 on violation)
npm run repo:verify-protection

# Output machine-readable JSON metrics for CI audit
node scripts/verify-branch-protection.mjs --json

# Apply/synchronize required protection rules via GitHub API
npm run repo:enforce-protection
```

#### `test-nginx-config.mjs`
Statically audits and validates `nginx/master.conf.template` ensuring compliance with reliability and traffic management policies:
- Asserts block syntax and brace balancing.
- Ensures no unbounded 300s timeouts exist in global server blocks.
- Asserts `proxy_buffering on` on standard routes with bounded read timeout ($\le 60$s).
- Validates explicit 100MB body and unbuffered streaming exceptions for `/api/v1/uploads`.
- Validates 3600s keepalive and unbuffered duplex transmission for `/socket.io/`.
- Validates unbuffered chunked streaming for GDPR export downloads.

```bash
# Run static Nginx traffic policy linter
npm run nginx:lint
```

#### `verify-container-digests.mjs`
Statically audits all Dockerfiles, Compose manifests, and CI service containers to ensure complete cryptographic immutability:
- Asserts that all `FROM` statements in backend and frontend Dockerfiles specify an `@sha256:` digest.
- Asserts that all 3rd-party service container definitions in `docker-compose.prod.yml`, `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.e2e.yml` specify an `@sha256:` digest.
- Asserts that CI workflow service containers in `ci-quality.yml`, `pr.yml`, and `playwright-nightly.yml` specify immutable digests.
- Prevents unpinned floating tags (e.g. `latest`, `alpine`, `pg16`) from introducing supply chain drift.

```bash
# Verify container image digests across the entire repository
npm run docker:verify-digests
```

#### `audit-dependencies.mjs`
Audits npm dependencies across root, backend, frontend, and shared workspaces against severity policies:
- Enforces zero unexempt Critical (24h SLA) or High (7d SLA) vulnerabilities on production dependencies (`--omit=dev`).
- Validates exception rules in `.dependency-security-exceptions.json`, requiring package, advisory ID, reason, mitigation, and approving owner.
- Automatically fails CI if any approved exception has expired (`expiresAt` date in the past).
- Supports `--all` for comprehensive scheduled security runs and `--json` for machine-readable output.

```bash
# Audit production dependencies (CI quality gate)
npm run audit:deps

# Audit all dependencies including devDependencies (weekly security schedule)
npm run audit:deps:all
```

#### `verify-lockfile-integrity.mjs`
Audits lockfile consistency, cryptographic integrity, and registry provenance across all workspaces:
- Enforces presence of `package-lock.json` with `lockfileVersion >= 2` in root, backend, frontend, and shared.
- Validates that every declared dependency, devDependency, and override in `package.json` matches the lockfile.
- Asserts that all external package artifacts have valid SHA-512 or SHA-1 integrity hashes.
- Disallows insecure unencrypted `http://` transport URLs.
- Executes `npm audit signatures` to verify digital signatures and Sigstore build attestations.
- Supports `--skip-signatures` for rapid local offline checks and `--json` for machine-readable reporting.

```bash
# Full lockfile and signature verification (CI gate)
npm run verify:lockfiles

# Fast offline lockfile check (skips registry signature network calls)
npm run verify:lockfiles:fast
```

---

### B. Database Backups and Disaster Recovery

#### `backup-postgres.sh`
Generates a compressed custom-format logical dump, verifies Table of Contents (TOC) integrity, and rotates historical backups:
```bash
# Local backup with 30-day retention
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" ./scripts/backup-postgres.sh

# Backup with automated off-host S3 upload
DATABASE_URL="..." S3_BACKUP_BUCKET="circlesfera-backups" ./scripts/backup-postgres.sh
```

#### `restore-postgres.sh`
Restores a verified dump. For operational safety, requires explicit confirmation:
```bash
CONFIRM=YES DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera_restore" \
  ./scripts/restore-postgres.sh /path/to/pg_backup_YYYYMMDD_HHMMSS.dump
```

#### `verify-backup-restore.sh`
Automated Disaster Recovery (DR) restore drill. Performs an end-to-end backup and restore cycle in an isolated ephemeral database (`CircleSfera_restore_test`), validating TOC integrity, public table counts, Prisma migrations, and referential consistency without impacting production:
```bash
# Unattended drill (creates temp dump, restores, verifies, and tears down)
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" npm run db:verify-restore

# Verify a specific existing dump file
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" \
  ./scripts/verify-backup-restore.sh /path/to/pg_backup_20260917_020000.dump
```

#### `install-backup-cron.sh`
Configures daily 02:00 UTC logical backup execution on the production host:
```bash
cd /srv/circlesfera && ./scripts/install-backup-cron.sh
```

---

### C. Migrations and Schema Governance

#### `check-prisma-schema-migrations.sh`
Validates that changes in `schema.prisma` are strictly backed by physical SQL migrations in `prisma/migrations/`:
```bash
DATABASE_URL="postgresql://prisma:prisma@localhost:5432/schema_check" \
  ./scripts/check-prisma-schema-migrations.sh
```

#### `lint-migration-safety.mjs`
Static migration linter preventing destructive operations (`DROP COLUMN`, `RENAME`, `SET NOT NULL` without default) to maintain Expand/Contract backward compatibility ($N-1$):
```bash
# General scan of all migrations
npm run db:lint-migrations

# Scan only staged migrations in Git
npm run db:lint-migrations -- --staged
```

#### `test-migration-rollback.sh`
Simulates migration rollback in an isolated ephemeral database, executing `down.sql`, resolving Prisma state, and verifying forward re-entrancy:
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" npm run db:test-rollback
```

---

### D. Secrets Management & Deployment

#### `upload-prod-env.sh`
Validates critical environment variables (`JWT_SECRET`, `ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, etc.) before encoding to base64 and uploading to GitHub Secrets (`ENV_PRODUCTION_B64`):
```bash
# Validate and upload secret
./scripts/upload-prod-env.sh

# Validate, upload secret, and trigger production deploy
./scripts/upload-prod-env.sh --deploy
```

---

### E. Diagnostics & Crypto

#### `diagnose-message-crypto.mjs`
Analyzes message encryption status during key rotation, classifying rows by plain text, active key encryption, or legacy keys:
```bash
DATABASE_URL="..." ENCRYPTION_KEY="..." node scripts/diagnose-message-crypto.mjs
```

---

### F. Smoke Checks & API Catalog

#### `validate-profile-drift-smoke.mjs`
Smoke test verifying User vs Profile identity segregation contracts:
```bash
npm run smoke:profile-drift
```

#### `generate-api-inventory.mjs`
Statically scans NestJS controllers to compile the official API route inventory:
```bash
npm run docs:api-inventory
```

---

### G. Quality & Test Coverage Enforcement

#### `npm run backend:cov`
Executes backend unit tests with V8 coverage collection and enforces risk-based
coverage thresholds across critical domains (Security, Authorization, Payments,
Monetization, Data Lifecycle, and Global baseline):
```bash
npm run backend:cov
```
