# CircleSfera

Production social platform: NestJS API, React SPA, PostgreSQL + Prisma, Redis, Stripe, LiveKit.

Monorepo layout:

```
CircleSfera/
├── circlesfera-backend/       # NestJS REST + WebSockets API
├── circlesfera-frontend/      # React SPA (consumer + admin.circlesfera.com panel)
├── circlesfera-shared/        # Shared types (partial adoption)
├── circlesfera-documentation/ # Product/tech docs, ADRs, runbooks
├── scripts/                   # Backups, schema checks, profile-drift smoke
├── e2e/                       # Playwright tests
├── nginx/                     # Reverse-proxy templates
├── .ai/                       # AI engineering framework (see AGENTS.md)
└── AGENTS.md                  # Operating rules (highest precedence)
```

## Source of truth

When docs disagree with code, trust in this order:

1. `circlesfera-backend/prisma/schema.prisma`
2. Implemented NestJS / React code
3. `circlesfera-documentation/` (indexed in [circlesfera-documentation/README.md](./circlesfera-documentation/README.md))
4. ADRs in [circlesfera-documentation/adr/](./circlesfera-documentation/adr/README.md)

Identity model (**User** = account/billing, **Profile** = social `@username`, **AdminIdentity** = staff panel): [15-identity-profile-model.md](./circlesfera-documentation/15-identity-profile-model.md).

Project status and known gaps: [00-status.md](./circlesfera-documentation/00-status.md).

## Stack (summary)

| Layer | Tech |
| --- | --- |
| API | NestJS 11, Prisma 7, PostgreSQL 16 + pgvector, Redis + BullMQ |
| Web | React 19, Vite 7, TanStack Query, Zustand, Tailwind 4 |
| Auth | HTTP-only JWT cookies, CSRF, passkeys, separate admin JWT |
| Realtime | Socket.IO + Redis adapter; LiveKit for broadcasts |
| Payments | Stripe (platform plans, Connect, tips/unlocks, live gifts) |

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

**Local dev (without Docker):** Node **24** (matches CI/Docker images). Build shared package first, then backend + frontend. Backend needs Postgres **and** Redis; pointing a host `start:dev` at container Redis without auth will fail — prefer the compose stack.

```bash
cd circlesfera-shared && npm install && npm run build && cd ..
cd circlesfera-backend && npm install && npx prisma migrate dev && npm run start:dev
cd circlesfera-frontend && npm install && npm run dev
```

Required env highlights: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ADMIN_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` (DM crypto), `REDIS_PASSWORD`. See root `.env.example` and [05-deployment-strategy.md](./circlesfera-documentation/05-deployment-strategy.md).

## Scripts

```bash
npm run check                 # Biome (root)
npm run smoke:profile-drift   # API smoke for User/Profile admin shapes (needs running stack)
npm run test:e2e              # Playwright (e2e/)
```

Per-package scripts: see [backend README](./circlesfera-backend/README.md) and [frontend README](./circlesfera-frontend/README.md).

## Documentation map

| Doc | Use when |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | AI-assisted or human engineering rules |
| [circlesfera-documentation/README.md](./circlesfera-documentation/README.md) | Full doc index (PRD, ERD, API inventory, security) |
| [03-api-detailed-endpoints.md](./circlesfera-documentation/03-api-detailed-endpoints.md) | Controller route inventory |
| [runbooks/](./circlesfera-documentation/runbooks/README.md) | Restore, rollback, admin cutover |
| [CONTRIBUTING.md](./CONTRIBUTING.md) / [SECURITY.md](./SECURITY.md) | Contributions and vulnerability reporting |

## Production notes

- Deploy: GitHub Actions → OVH VPS, `docker-compose.prod.yml`, TLS on the host.
- Backups: `scripts/backup-postgres.sh`, `scripts/backup-uploads.sh` — [11-backups-strategy.md](./circlesfera-documentation/11-backups-strategy.md).
- Admin Panel: `admin.circlesfera.com`, separate operator auth ([ADR-0013](./circlesfera-documentation/adr/0013-admin-panel-admin-identity.md)).

## License

MIT — see [LICENSE](./LICENSE).
