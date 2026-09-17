# Dependency Provenance and Lockfile Integrity Policy — CircleSfera

This document establishes the architecture, cryptographic verification standards, manifest synchronization rules, and automated CI/CD gates that guarantee dependency provenance and lockfile integrity across all CircleSfera workspaces.

---

## 1. Scope and Core Principles

CircleSfera enforces a zero-trust software supply chain architecture. Build reproducibility and production reliability depend upon completely deterministic, immutable package installations. Unpinned versions, uncommitted lockfile drift, untrusted registries, or tampered tarballs expose systems to supply chain attacks, non-deterministic bugs, and production outages.

CircleSfera adheres to four fundamental principles of lockfile governance:

1. **Immutable Lockfile Enforcement**:
   - Every workspace maintains a committed `package-lock.json` with `lockfileVersion: 3`.
   - Continuous Integration (CI), automated test runners, and Docker container builds execute `npm ci` rather than `npm install`, ensuring that dependencies are installed strictly from the resolved lockfile tree and preventing accidental lockfile mutations.
2. **Strict Manifest-to-Lock Synchronization**:
   - Every runtime dependency, development dependency, and package override declared in `package.json` must exactly match the resolved constraints in `package-lock.json`.
   - Any manifest modification made without regenerating and committing the lockfile immediately fails the CI gate.
3. **Cryptographic Integrity and Secure Transport**:
   - Every external package entry in the lockfile must include a cryptographically strong integrity hash (`sha512-...`).
   - Package tarballs must resolve exclusively over secure TLS connections (`https://`). Unencrypted `http://` URLs are rejected by static linters.
4. **Cryptographic Registry Provenance**:
   - All external packages published to public registries are verified against digital package signatures and Sigstore build attestations via `npm audit signatures`.

---

## 2. Multi-Workspace Lockfile Topology

CircleSfera is structured as a modular multi-workspace repository:

| Workspace | Directory | Role | Lockfile Format |
| :--- | :--- | :--- | :--- |
| **Root** | `.` | Development orchestration, tooling, Playwright E2E, Husky hooks. | `lockfileVersion: 3` |
| **Backend** | `circlesfera-backend` | NestJS core API, Prisma ORM, BullMQ queues, Stripe integration. | `lockfileVersion: 3` |
| **Frontend** | `circlesfera-frontend` | React SPA (Vite), Zustand state, WebAuthn client. | `lockfileVersion: 3` |
| **Shared** | `circlesfera-shared` | Shared TypeScript contracts, DTOs, enums, utility functions. | `lockfileVersion: 3` |

Each workspace manages its own isolated `package.json` and `package-lock.json` pair to prevent cross-workspace dependency contamination. Local inter-workspace links (such as `@circlesfera/shared` referenced via `"file:../circlesfera-shared"`) are explicitly marked as symbolic links (`"link": true`) in the backend and frontend lockfiles.

---

## 3. Automated Verification Engine (`verify-lockfile-integrity.mjs`)

CircleSfera provides an automated verification script (`scripts/verify-lockfile-integrity.mjs`) that inspects all workspaces:

```bash
# Full lockfile audit including cryptographic registry signatures
npm run verify:lockfiles

# Fast offline lockfile check (skips network signature verification)
npm run verify:lockfiles:fast

# Machine-readable JSON output for automated pipelines
node scripts/verify-lockfile-integrity.mjs --json
```

### Verification Checks Performed

1. **Existence and Format**:
   - Confirms `package.json` and `package-lock.json` are present in all four workspaces.
   - Validates that `lockfileVersion >= 2` (CircleSfera standardizes on version 3).
2. **Manifest Alignment**:
   - Compares declared `dependencies`, `devDependencies`, and `optionalDependencies` in `package.json` against `package-lock.json.packages[""]`.
   - Detects missing dependencies, drifted version specifiers, and orphaned lockfile entries.
   - Validates package `overrides` consistency.
3. **Integrity Hashes & Transport**:
   - Scans all package nodes under `packages`.
   - Confirms all external registry tarballs have valid `sha512-` or `sha1-` hashes.
   - Rejects any package resolved via insecure `http://` transport.
4. **Registry Signatures & Attestations**:
   - Runs `npm audit signatures` across workspaces.
   - Fails if any package artifact has an invalid registry signature or tampered content.

---

## 4. CI/CD Pipeline Enforcement

### Pre-Merge Quality Gate (`.github/workflows/ci-quality.yml`)

The reusable quality gate enforces lockfile integrity before any test or build action executes:

1. **Static Lockfile Verification**:
   - Runs `npm run verify:lockfiles` immediately after repository checkout.
   - If any workspace exhibits lockfile drift, missing hashes, or signature failures, the job terminates and merge is blocked.
2. **Immutable Installation (`npm ci`)**:
   - Monorepo root: `npm ci`
   - Shared package: `cd circlesfera-shared && npm ci && npm run build`
   - Backend API: `cd circlesfera-backend && npm ci && npx prisma generate ...`
   - Frontend SPA: `cd circlesfera-frontend && npm ci && npm run build`
3. **Production Container Builds (`Dockerfile`)**:
   - Both backend and frontend multi-stage Dockerfiles execute `npm ci` and `npm ci --omit=dev`, guaranteeing that container artifacts are identical to tested CI builds.

---

## 5. Developer Runbook & Drift Remediation

### Scenario A: Adding or Updating a Dependency
When adding, updating, or removing a package in any workspace, always regenerate the lockfile before pushing:

```bash
# Example: Adding a package to backend
cd circlesfera-backend
npm install <package-name>@<version>

# Verify lockfile integrity locally
npm run verify:lockfiles:fast --prefix ..

# Commit both files atomically
git add package.json package-lock.json
git commit -m "chore(deps): add <package-name>"
```

### Scenario B: CI Failure — Manifest Mismatch
If CI reports:
```text
❌ Manifest mismatch in dependencies: "pkg" (^1.2.0) is declared in package.json but missing from package-lock.json.
```
Remediation:
1. Navigate to the affected workspace directory.
2. Run `npm install` to synchronize `package-lock.json` with `package.json`.
3. Verify with `npm run verify:lockfiles:fast`.
4. Commit the updated `package-lock.json`.

### Scenario C: CI Failure — Insecure Transport
If CI reports an `http://` resolved URL in `package-lock.json`:
1. Check if an outdated private or mirror registry was configured in local `.npmrc`.
2. Clear npm cache and run `npm install --registry=https://registry.npmjs.org`.
3. Verify that all resolved URLs in `package-lock.json` start with `https://`.
