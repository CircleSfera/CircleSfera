# CircleSfera

Production social platform: NestJS API, React SPA, PostgreSQL + Prisma, Redis, Stripe, LiveKit.

Monorepo layout:

```
CircleSfera/
├── circlesfera-backend/       # NestJS REST + WebSockets API
├── circlesfera-frontend/      # React app: web, Admin Panel and Backoffice, and the iOS/Android apps (Capacitor)
├── circlesfera-shared/        # Shared types (partial adoption)
├── circlesfera-helpdesk/      # Help Desk, a product of its own (ADR-0034); being moved in steps
├── docs/adr/                  # Architecture Decision Records (full text)
├── scripts/                   # Backups, schema and dependency checks, CI and ops helpers
├── e2e/                       # Playwright: the whole stack against a real database
├── e2e-staging/               # Playwright: checks against a deployed environment
├── load-tests/                # API load tests
├── infra/                     # Host configuration
├── nginx/                     # Reverse-proxy templates
└── AGENTS.md                  # Operating rules (highest precedence)
```

## Source of truth

Documentation lives in Notion under [CircleSfera](https://app.notion.com/p/3b2dfa08f2f580a5a11ac45a2621a31c), in seven domains (Product, Engineering, Quality, Design & Brand, Business & Growth, Execution, Governance); the full text of Architecture Decision Records stays in `docs/adr/`. In the repository:

1. `circlesfera-backend/prisma/schema.prisma` and its migrations for data and relations
2. Implemented NestJS / React code on `main` for current behaviour
3. ADRs in [docs/adr/](./docs/adr/README.md) for the full text of architecture decisions

Code shows what is implemented, not what is intended; product intent lives in Notion → Product. See [AGENTS.md](./AGENTS.md).

Identity model (**User** = account/billing, **Profile** = social `@username`, **AdminIdentity** = staff panel): Notion → Engineering → [Data Architecture](https://app.notion.com/p/3e9dfa08f2f58131bd62f1c59d8741e1).

## Stack (summary)

| Layer | Tech |
| --- | --- |
| Language | TypeScript 7, Node 26 |
| API | NestJS 12, Prisma 7, PostgreSQL 16 + pgvector, Redis + BullMQ |
| Web | React 19, Vite 8, TanStack Query, Zustand, Tailwind 4 |
| Native apps | Capacitor 8, built from the same frontend (iOS and Android) |
| Auth | HTTP-only JWT cookies, CSRF, passkeys, separate admin JWT |
| Realtime | Socket.IO + Redis adapter; LiveKit for broadcasts |
| Payments | Stripe (Platform Plans and promotions) |

## Quick start

**Recommended:** full stack via Docker (Postgres, Redis, backend, frontend, nginx proxy).

```bash
cp .env.example .env   # fill DATABASE_URL, secrets, Redis password, etc.
docker compose up -d
```

| URL | Purpose |
| --- | --- |
| http://localhost:8080 | App via nginx proxy (`/api/v1` → backend) |
| http://localhost:5173 | Vite dev server (direct) |
| http://localhost:3000/api/v1 | Backend API (direct) |

**Local dev (without Docker):** Node **26** (matches CI/Docker images). Install the shared package first (its `npm install` also builds `dist/`; run `npm run watch` there while you change it), then backend + frontend. Backend needs Postgres **and** Redis; pointing a host `start:dev` at container Redis without auth will fail — prefer the compose stack.

```bash
npm install                    # root: Biome, Git hooks, Playwright, commitlint
cd circlesfera-shared && npm install && cd ..
cd circlesfera-backend && npm install && npx prisma migrate dev && npm run start:dev
cd circlesfera-frontend && npm install && npm run dev
```

Required env highlights: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ADMIN_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` (DM crypto), `REDIS_PASSWORD`. See root `.env.example`.

## Scripts

```bash
npm run check                 # Biome (root)
npm run smoke:profile-drift   # API smoke for User/Profile admin shapes (needs running stack)
```

## Browser tests (Playwright)

Three suites, each with its own configuration:

| Suite | Runs against | How |
| --- | --- | --- |
| [`e2e/`](./e2e/README.md) | The whole stack, writing real users to a database | `npm run e2e:db:up`, `npm run e2e:db:migrate`, the backend on that database, then `npm run test:e2e` from the root ([e2e/README](./e2e/README.md)) |
| [`circlesfera-frontend/e2e/`](./circlesfera-frontend/e2e/README.md) | The web app alone, with the API stubbed | `npm run test:e2e` in `circlesfera-frontend` |
| `e2e-staging/` | A deployed environment | Run by the deploy workflow after a staging deploy (`npx playwright test -c e2e-staging/playwright.config.ts`) |

Per-package scripts: see [backend README](./circlesfera-backend/README.md) and [frontend README](./circlesfera-frontend/README.md).

## Documentation map

| Doc | Use when |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI-assisted or human engineering rules |
| [Notion → CircleSfera](https://app.notion.com/p/3b2dfa08f2f580a5a11ac45a2621a31c) | Product, architecture, operations, quality and decisions (start with its "Start here" table) |
| `/api/docs` on a running backend | OpenAPI reference generated from the controllers |
| [docs/adr/](./docs/adr/README.md) | Architecture Decision Records |
| [CONTRIBUTING.md](./CONTRIBUTING.md) / [SECURITY.md](./SECURITY.md) | Contributions and vulnerability reporting |

## Production notes

- Deploy: GitHub Actions → OVH VPS, `docker-compose.prod.yml`, TLS on the host.
- Backups: `scripts/backup-postgres.sh`, `scripts/backup-uploads.sh` (nightly via `scripts/install-backup-cron.sh`) — Notion → [Backup & Recovery](https://app.notion.com/p/3e9dfa08f2f581f4b21bca7f1356434c).
- Admin Panel: `admin.circlesfera.com`, separate operator auth ([ADR-0013](./docs/adr/0013-admin-panel-admin-identity.md)).

## License

MIT — see [LICENSE](./LICENSE).
