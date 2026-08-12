# Stack and commands

Verified against the repository on 2026-07-27. Versions come from the `package.json` files; when
this file and a `package.json` disagree, the `package.json` wins and this file is stale.

## Monorepo layout

```text
/                        Biome config, Playwright config, docker-compose, nginx, scripts
circlesfera-backend/     NestJS 11 API + Prisma + BullMQ workers + Socket.IO gateway
circlesfera-frontend/    React 19 SPA (Vite), PWA, TanStack Query + Zustand
circlesfera-shared/      Small shared package: some enums, interfaces, DTOs
circlesfera-documentation/  12 numbered docs + adr/ + runbooks/
e2e/                     Playwright specs (root-level under e2e/, including e2e/tests/)
```

`circlesfera-landing/` was removed from the tree (Jul 2026). Its nginx listener is gone
(`nginx/master.conf.template`). Do not restore or deploy it.

## Backend — `circlesfera-backend`

| Area | Reality |
| --- | --- |
| Framework | NestJS **11.1.26** (`@nestjs/microservices` 11.1.27), Express platform |
| Language | TypeScript **6.0.3**, ESM (`"type": "module"`), target ES2023, `module: NodeNext` |
| Runtime | `node:24-alpine` in the Dockerfile; no `engines` field in `package.json` |
| ORM | `@prisma/client` **7.8.0** + `@prisma/adapter-pg` **7.8.0** (driver adapter, `pg` Pool); CLI `prisma` **7.6.0** |
| Database | PostgreSQL with `vector` extension (`pgvector/pgvector:pg16` image) |
| Auth | `@nestjs/jwt` 11, `passport-jwt`, `argon2` + `bcrypt`, `@simplewebauthn/server` (passkeys), `otplib` (2FA) |
| Hardening | `helmet` 8, `@nestjs/throttler` 6, `csrf-csrf` 4, `cookie-parser` |
| Cache | `@nestjs/cache-manager` + `cache-manager` 6 + `@keyv/redis`; `ioredis` for the Socket.IO adapter |
| Queues | `@nestjs/bullmq` + `bullmq` 5 |
| Real-time | `socket.io` 4.8 + `@socket.io/redis-adapter` |
| Payments | `stripe` **22.0.2** |
| Observability | `nestjs-pino` + `pino` 10, `@sentry/nestjs` 10, `@nestjs/terminus` |
| Validation | `class-validator` 0.14 + `class-transformer` (no zod in `src/`) |
| Scheduling | `@nestjs/schedule` |
| API docs | `@nestjs/swagger` — served at `/api/docs` |
| Tests | `vitest` **4.1.9** + `supertest` + `@nestjs/testing` |
| Lint/format | `@biomejs/biome` 2.5.0 |

Commands:

```bash
npm run dev                      # nest start --watch --exec "node dist/main.js" (alias: start:dev)
npm run build                    # nest build
npm test                         # vitest run (unit, src/**/*.spec.ts)
npm run test:e2e                 # vitest run --config ./vitest.e2e.config.ts (test/*.e2e-spec.ts)
npm run test:cov                 # coverage; thresholds: statements/lines 30%
npm run lint                     # biome lint .
npm run check                    # biome check --write .
npm run prisma:migrate           # prisma migrate dev
npm run prisma:generate
npm run prisma:seed              # prisma/seed.ts (plans, demo users, content)
npm run prisma:seed:audio        # prisma/seed-audio.ts
npm run prisma:check-migrations  # drift check against an empty Postgres
npm run embeddings:backfill      # tsx scripts/generate-embeddings.ts
```

Backend e2e tests hit a real Postgres and Redis and run with `fileParallelism: false`.

## Frontend — `circlesfera-frontend`

| Area | Reality |
| --- | --- |
| Framework | React **19.2.4** + `react-dom` 19.2.4 |
| Build | Vite **7.3.5**, TypeScript **5.9.3** (note: different major from the backend) |
| Router | `react-router-dom` **7.18.0**, routes declared in `src/App.tsx` |
| Server state | `@tanstack/react-query` **5.90.20** |
| Client state | `zustand` **5.0.11** (9 stores in `src/stores/`) |
| HTTP | `axios` 1.13, single client in `src/services/api.ts` (`withCredentials: true`) |
| Styling | Tailwind CSS **4.1.18** via `@tailwindcss/postcss`; tokens in `src/index.css` |
| Motion | `framer-motion` 12 |
| Icons | `lucide-react` |
| i18n | `i18next` 26 + `react-i18next`; locales `en`, `es` |
| Real-time | `socket.io-client` 4.8 |
| Media | `hls.js`, `@ffmpeg/*`, `konva`/`react-konva`, LiveKit client |
| Charts | `recharts` |
| PWA | `vite-plugin-pwa` 1.3 (`injectManifest`) + `src/service-worker.ts` |
| Observability | `@sentry/react` 10 |
| Tests | `vitest` 4.1.9 + Testing Library + `jsdom`; config inside `vite.config.ts` |
| Lint/format | `@biomejs/biome` 2.4.12 |

Commands:

```bash
npm run dev        # vite (port 5173)
npm run build      # tsc -b && vite build  <- this is the frontend typecheck gate
npm test           # vitest run (11 test files today)
npm run lint       # biome lint .
npm run check      # biome check --write .
```

## Root

```bash
npm run check      # biome check --write . across the monorepo — see the caveat below
npm run test:e2e   # npx playwright test (testDir ./e2e, baseURL http://localhost:5173)
```

Biome versions are not aligned: root and frontend **2.4.12**, backend **2.5.0**, `circlesfera-shared`
**1.9.4** (a different major with a different config format). Running the unscoped root `npm run
check` today reformats 7 files that no CI job covers — scope Biome to your changed paths instead
(gap T1 in `known-gaps.md`).

Playwright's `globalSetup` (`e2e/global-setup.ts`) needs a reachable backend at `BACKEND_URL`
(default `http://localhost:3005/api/v1`) and E2E credentials; skip with `SKIP_GLOBAL_SETUP=true`
for `e2e/smoke.spec.ts`.

## Local infrastructure

`docker-compose.yml` (dev): `postgres` (pgvector/pgvector:pg16), `redis:7-alpine`,
`backend` on host port **3005** → container 3000, `frontend` on **5173**, `proxy` (nginx) on
**8080**.

`docker-compose.prod.yml`: `nginx-proxy` on **8082**, plus internal `postgres`, `redis`
(password-protected), `backend` (health-checked on `/api/v1/health`), `frontend`. Backend
entrypoint runs `npx prisma migrate deploy` before `node dist/main`.

## What CI actually enforces

`.github/workflows/pr.yml` on PRs to `main`, Node 24, with Postgres + Redis services:

1. root `npm install`
2. `circlesfera-shared`: install + build
3. backend: install, `prisma generate`, `npm run lint`, `npm test`
4. `./scripts/check-prisma-schema-migrations.sh` (schema/migration drift)
5. backend `npm run test:e2e`
6. frontend: install, `npm run lint`, `npm test`, `npm run build`
7. separate job: Playwright `e2e/smoke.spec.ts` against a locally started backend on `:3005`

`deploy.yml` repeats the test job, builds and pushes GHCR images, then deploys over SSH to the OVH
VPS with a health poll and automatic rollback to the previous SHA. `playwright-nightly.yml` runs
the full Playwright suite on a cron. `ops-reencrypt.yml` is manual-only ops tooling.

There is no dedicated backend typecheck step in the PR `test` job — `nest build` only runs in the
Playwright job. Do not assume type errors will be caught by `npm test`.

There is also no root Biome step. Each `npm run lint` is `biome lint .` inside its own package, so
formatting is never enforced in CI, and `prisma/`, `e2e/` and `scripts/` are outside every linted
scope.

## Environment variables

`.env.example` is the inventory, grouped by area (core runtime, auth/security, Redis, Stripe,
LiveKit, OpenAI, email via Brevo, push VAPID, passkeys, Sentry, Slack ops, media storage, frontend
build, backups). Production fails fast without `ENCRYPTION_KEY`, `OPENAI_API_KEY` and LiveKit
credentials. Never print, log or commit values.
