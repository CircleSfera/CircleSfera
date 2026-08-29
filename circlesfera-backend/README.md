# CircleSfera Backend

NestJS API for CircleSfera. Global prefix: **`/api/v1`**.

This is a production codebase (auth, monetization, chat, live, moderation, admin RBAC), not a tutorial API. For route inventory use [03-api-detailed-endpoints.md](../circlesfera-documentation/03-api-detailed-endpoints.md); for models use [`prisma/schema.prisma`](./prisma/schema.prisma).

## Identity model

| Model | Role |
| --- | --- |
| `User` | Account: email, auth, Stripe, platform plans, trust/abuse, settings |
| `Profile` | Social identity: **`username`**, avatar, content & graph FKs (`profileId`) |
| `AdminIdentity` | Admin Panel operators (separate JWT, MFA, RBAC) |

JWT session exposes `userId` (`sub`) and primary `profileId`. Details: [15-identity-profile-model.md](../circlesfera-documentation/15-identity-profile-model.md).

## Stack

- NestJS 11, TypeScript, Vitest
- PostgreSQL 16 + Prisma 7 (`@prisma/client` 7.8)
- Redis (cache, BullMQ, Socket.IO adapter)
- Argon2 password hashing, cookie JWT + CSRF ([ADR-0007](../circlesfera-documentation/adr/0007-auth-cookies-csrf.md))

## Module map (high level)

`src/` is organized by domain modules, including: `auth`, `profiles`, `users`, `posts`, `stories`, `feed`, `follows`, `chat`, `notifications`, `search`, `interactive` (polls/QnA), `live`, `monetization`, `payments`, `creator`, `reports`, `appeals`, `admin`, `admin-auth`, `uploads`, `media`, `ai`, `webrtc`, `maintenance`, and others. Business rules live in **services**, not controllers.

## Getting started

**Prerequisites:** Node 24, PostgreSQL, Redis, built `@circlesfera/shared`.

```bash
cd circlesfera-backend
npm install
cp .env.example .env   # or symlink from repo root .env
npx prisma generate
npx prisma migrate dev
npm run prisma:seed    # optional
npm run start:dev
```

API base (local): `http://localhost:3000/api/v1`

**Docker (recommended):** from repo root, `docker compose up -d` — backend runs with Postgres + Redis on the compose network.

### Essential environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_HOST` / `REDIS_PASSWORD` | Cache, queues, sockets |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Platform session cookies |
| `JWT_ADMIN_SECRET` | Admin Panel JWT |
| `CSRF_SECRET` | Double-submit CSRF |
| `ENCRYPTION_KEY` | Encrypted DMs at rest |

See `.env.example` for Stripe, LiveKit, storage, email, OpenAI, etc.

## Auth behaviour (platform)

- Login/register set **HTTP-only cookies** (access + refresh), not tokens in JSON bodies.
- Mutating requests from the browser require **CSRF** (`GET /csrf-token`, header `x-csrf-token`).
- `@CurrentUser()` → `{ userId, email, role, profileId }`.
- Admin routes under `/admin/*` require **admin** session (`/admin-auth/*`), not platform cookies.

## Database

- **Canonical schema:** `prisma/schema.prisma` (~65 models). Do not edit without a migration in the same change.
- Migrations: `prisma/migrations/`
- Seed: `npm run prisma:seed`, `npm run prisma:seed:audio`
- Admin bootstrap: `npm run bootstrap-admin`
- Embedding backfill: `npm run embeddings:backfill`
- Migration drift check: `npm run prisma:check-migrations`

## Testing

```bash
npm test              # unit (Vitest)
npm run test:e2e      # backend e2e
npm run test:cov      # coverage
```

Repo-level Playwright suites live in `/e2e`.

## Ops scripts (repo root)

```bash
npm run smoke:profile-drift   # from monorepo root — admin User/Profile response smoke
```

Message re-encryption after key rotation: `dist/scripts/reencrypt-messages.js` (see runbooks).

## Security

- Throttling (`@nestjs/throttler`), Helmet/CSP, validated DTOs (whitelist)
- `OwnershipGuard` defaults to **`profileId`** for social resources
- Do not weaken guards or expose secrets in logs/responses

## Related docs

- [06-security-privacy-compliance.md](../circlesfera-documentation/06-security-privacy-compliance.md)
- [02-database-er-diagram.md](../circlesfera-documentation/02-database-er-diagram.md)
- [ADR index](../circlesfera-documentation/adr/README.md)

## License

MIT — see [LICENSE](../LICENSE).
