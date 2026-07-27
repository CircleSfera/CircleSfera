# Playbook — Dependency change

Adding or upgrading a dependency. Adding one is on the `AGENTS.md` confirmation list: propose, then
wait.

Specialists: `staff-architect` → `security` → `devops` → `qa`.

## Adding a dependency

Answer all of these before proposing:

1. **What problem does it solve**, in one sentence?
2. **Can the existing stack already do it?** Check first — the repo already has `axios`, TanStack
   Query, Zustand, `framer-motion`, `lucide-react`, `recharts`, `konva`, `hls.js`, `@ffmpeg/*`,
   Workbox on the frontend; NestJS modules, Prisma, BullMQ, cache-manager, Socket.IO, `stripe`,
   `pino`, Sentry, Terminus, Swagger, `class-validator` on the backend. Most "we need a library"
   requests are already covered.
3. **Cost:** bundle size for the frontend, install and cold-start cost for the backend, transitive
   dependency count.
4. **Maintenance:** last release, open critical issues, single-maintainer risk, licence compatibility
   with the repo's MIT licence.
5. **Security:** what does it get access to? Anything touching auth, crypto, payments or file handling
   raises the bar substantially.
6. **Exit:** how hard is it to remove later? A library that spreads across 40 files is a marriage.
7. **Overlap:** does it duplicate something installed? Two state managers, two HTTP clients, two
   styling systems or two icon sets are forbidden.

Then propose: the dependency, the alternative of writing it ourselves, and a recommendation. Wait for
approval.

## Upgrading a dependency

1. **Read the changelog** between the installed and target versions. Every breaking note.
2. **Classify:** patch / minor / major. Majors get their own PR, never bundled with a feature.
3. **Watch the coupled pairs in this repo:**
   - `@prisma/client`, `@prisma/adapter-pg`, `@prisma/config` and the `prisma` CLI must move together.
     They are currently skewed (client 7.8.0, CLI 7.6.0) — see
     [`../core/known-gaps.md`](../core/known-gaps.md) B5.
   - All `@nestjs/*` packages move together.
   - `bullmq` with `@nestjs/bullmq`; `socket.io` with `@socket.io/redis-adapter` and
     `socket.io-client`.
   - `react` with `react-dom` and `@types/react`.
   - `tailwindcss` with `@tailwindcss/postcss`.
   - `vitest` with `@vitest/coverage-v8` and `@vitest/ui`.
   - Biome moves independently but a version bump can change formatting across the repo — do that in
     its own commit.
   - TypeScript is intentionally different between backend (6.0.3) and frontend (5.9.3); do not
     "align" them without checking the shared package builds under both.
4. **Stripe** major upgrades change API versions and webhook payloads. Treat as a payments change:
   read the migration guide, re-verify the fee math and webhook idempotency.
5. **Dependabot** already opens weekly npm PRs for root, backend and frontend. Review them; do not
   merge blind.

## Verification

```bash
cd circlesfera-shared && npm install && npm run build
cd circlesfera-backend && npm install && npm run lint && npm test && npm run build && npm run test:e2e
cd circlesfera-frontend && npm install && npm run lint && npm test && npm run build
cd "$(git rev-parse --show-toplevel)" && npm run test:e2e -- e2e/smoke.spec.ts
```

Commit the updated `package-lock.json`. Check the built frontend chunk sizes if a frontend dependency
changed.

## Hard rules

- Never add a dependency without explicit confirmation.
- Never upgrade a major version silently inside a feature PR.
- Never introduce a second library for a job already covered.
- Never pin to a git branch or an unpublished version.
- Never ignore a lockfile conflict by regenerating the lockfile blindly.

## Report

- **Dependency, version, and why.**
- **Alternatives considered**, including doing it ourselves.
- **Cost:** size, transitive deps, maintenance risk, licence.
- **Breaking changes** handled, with the files touched.
- **Verification** with real command output.
- **Rollback:** how to revert.
