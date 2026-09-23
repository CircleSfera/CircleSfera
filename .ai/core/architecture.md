# [ARCHIVED] Architecture — as built

> **⚠ WARNING: THIS DOCUMENT IS ARCHIVED.**
> The canonical and definitive technical architecture documentation is now located at `circlesfera-documentation/01-architecture.md` and `circlesfera-documentation/00-status.md`. Please refer to those documents as the single source of truth.

A map of how CircleSfera is actually structured, so agents follow the existing shape instead of
inventing one. Narrative background: `circlesfera-documentation/02-database-er-diagram.md`,
`03-api-detailed-endpoints.md`, `05-deployment-strategy.md`. Durable decisions:
[`adr/`](../../circlesfera-documentation/adr/README.md).

## Shape of the system

```text
Browser (React SPA, PWA)
   │  HTTPS, cookies (httpOnly) + x-csrf-token header
   ▼
nginx  (host TLS in prod; compose proxy in dev)
   │
   ├── static frontend bundle
   └── /api/v1/*  and  /api/v1/socket.io/*
        ▼
   NestJS modular monolith  ──►  PostgreSQL (+ pgvector)
        │                   ──►  Redis  (cache, BullMQ, Socket.IO pub/sub)
        │                   ──►  Stripe, LiveKit, OpenAI, Brevo, S3/Cloudinary
        └── BullMQ processors in-process (10 queues) + @Cron maintenance jobs
```

It is a **modular monolith**, not microservices. Keep it that way unless an ADR says otherwise.

## Backend request pattern

```text
Controller (thin, guards + DTO)  ->  Service (business rules + PrismaService)  ->  Postgres
                                        └─> Queue / Cache / Socket / external SDK
```

What this codebase does, verified:

- **Controllers are thin.** They apply guards, bind DTOs, and delegate. Example:
  `src/posts/posts.controller.ts`.
- **Services talk to `PrismaService` directly.** There is **no repository layer** and **no mapper
  layer**. Do not introduce one as a side effect of another change — that is an architectural
  decision requiring confirmation and an ADR.
- **DTOs per module** under `src/<module>/dto/`, using `class-validator`.
- **Ownership for standard REST mutations goes through `OwnershipGuard` + `@RequireOwnership({model, userIdField?})`**
  (`src/auth/guards/ownership.guard.ts`) — the one authoritative ownership check for any route that maps to a single
  Prisma model and a route `:id` param (AUTHZ-002, closing the earlier "no generic ownership guard, add the check
  yourself" gap). After the User/Profile split ([ADR-0015](../../circlesfera-documentation/adr/0015-user-profile-identity-split.md)),
  social content ownership is typically the entity's `profileId` against the caller's `profileId` (JWT); account/billing
  surfaces still use `userId` — both are expressed via `userIdField`. Do not duplicate an inline ownership check in the
  service once the route is guarded; that reintroduces the divergent-implementations problem AUTHZ-002 removed.
  For ownership checks that don't fit the guard's shape — the id comes from the request body/query instead of a route
  param, or the caller isn't an HTTP request at all — extract one shared, named method on the owning service instead of
  inlining the check per call site (see `BookmarksService.verifyCollectionOwnership` for a body-supplied id, and
  `AppGateway.requireStreamHostOrCoHost` for a Socket.IO event handler).
- **Async work goes to BullMQ processors** in `src/<module>/processors/`.
- **Unit tests sit next to the code** as `src/**/*.spec.ts`.

## Cross-cutting configuration

Global providers in `src/app.module.ts`:

| Slot | What |
| --- | --- |
| `APP_PIPE` | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` |
| `APP_GUARD` | `ThrottlerGuard` (three windows: short/medium/long) |
| `APP_FILTER` | `AllExceptionsFilter` |

Bootstrap in `src/main.ts`: `helmet`, CORS, `cookieParser`, `setGlobalPrefix('api/v1')`, CSRF
middleware with an explicit exclusion list (the unauthenticated auth routes, `/csrf-token`, the
Stripe webhook and socket.io — read the list in the file),
`RedisIoAdapter`, Swagger at `/api/docs`, Sentry init.

Because `forbidNonWhitelisted` is on, an undecorated DTO property is a **400**, not a silently
ignored field. Adding a request field means adding a validated DTO property.

## Shared infrastructure — `src/common/`

| Path | Purpose |
| --- | --- |
| `adapters/redis-io.adapter.ts` | Socket.IO Redis adapter for horizontal scale |
| `cache/cache.module.ts` | Global `RedisCacheModule` (cache-manager + Keyv/Redis), default TTL 10 min |
| `config/cookie.config.ts` | `access_token` (15 min) and `refresh_token` (7 days) httpOnly cookies |
| `config/csrf.config.ts` | `csrf-csrf` double-submit configuration |
| `csrf/csrf.controller.ts` | `GET /api/v1/csrf-token` |
| `dto/pagination.dto.ts` | Pagination DTO + `createPaginatedResult` helper — reuse it |
| `filters/all-exceptions.filter.ts` | Global error shape + Sentry/Slack on 5xx |
| `services/crypto.service.ts` | AES-256-GCM for chat message content (`ENCRYPTION_KEY`) |
| `stripe/stripe.service.ts` | Single Stripe client (Checkout, Connect, Identity, webhooks) |
| `utils/content-parser.ts` | `extractHashtags`, `extractMentions` |

There is no `common/interceptors/`, no `common/pipes/`, and guards live in `src/auth/guards/`.

## Async and real-time

**Queues (BullMQ, 10):** `ai-processing`, `analytics-processing`, `chat-processing`,
`feed-fanout`, `notifications-processing`, `slack-processing`, `stories-processing`,
`users-processing`, `video-transcoding`, `edits-processing`. Repeatable jobs are registered in
`OnApplicationBootstrap` hooks (chat cleanup hourly, Slack briefing 08:00 UTC, GDPR crons
02:00/03:00/04:00 UTC, and others).

**Cron:** `ScheduleModule.forRoot()` plus `src/maintenance/maintenance.service.ts` (expired
stories, orphan uploads, stale tokens, …).

**WebSocket:** `src/socket/app.gateway.ts`, namespace `events`, path `/socket.io`, JWT read from the
`access_token` cookie or the handshake, rooms `user:{id}` and `presence:{id}`.

**No domain event bus.** `@nestjs/event-emitter` / `EventEmitter2` is not installed. Cross-module
communication is direct service injection or a queue. Do not propose event-driven refactors
casually — that is an ADR-level decision.

**Feed fan-out is hybrid** — see
[ADR-0009](../../circlesfera-documentation/adr/0009-feed-fan-out.md); inbox writes go through
`feed-fanout` and reads combine inbox rows with vector reads from `post_embeddings`.

## Frontend architecture

```text
index.html -> src/main.tsx (BrowserRouter, QueryClient, SW registration)
           -> src/App.tsx  (all route declarations, React.lazy for heavy routes)
           -> src/layouts/LayoutWrapper.tsx (nav shell, socket, story overlay, skip link)
```

- **Server state:** TanStack Query used inline in pages/components. Query keys are ad-hoc strings
  (`['feed', activeTab]`, `['profile', username]`, `['post', id]`); there is no central key
  factory and no `src/queries/` directory. Follow the existing key shape of the domain you touch.
- **Client state:** 11 Zustand stores (`authStore`, `adminAuthStore`, `securityStore`, `uiStore`,
  `socketStore`, `notificationsStore`, `storyStore`, `frameStore`, `studioStore`, `useCallStore`,
  `useExperimentStore`). `authStore` persists profile flags only — **never tokens**, since auth is
  cookie-based. Admin panel auth is a separate store (`adminAuthStore`).
- **HTTP:** one `ApiClient` in `src/services/api.ts` with `withCredentials: true`, a CSRF
  interceptor that attaches `x-csrf-token` to non-GET requests and retries once on 403, and a 401
  handler that attempts `POST /auth/refresh` then logs out and redirects to `/accounts/login`.
  Domain services (`src/services/*.service.ts`, ~30) wrap it. Never call `fetch`/`axios` directly
  from a component.
- **Guards:** `src/components/auth/` — `AuthGuard`, `GuestGuard`, `AdminGuard`,
  `CreatorStudioGuard`.
- **Routing:** every route is declared in `src/App.tsx`, including legacy redirects
  (`/post/:id` → `/p/:id`, `/messages` → `/direct/inbox`, `/settings` → `/accounts`). Admin and
  Creator are single routes with a `:tab` param driven by `adminNav.ts` / `creatorNav.ts`.
- **Performance:** `React.lazy` + Vite `manualChunks`, `ProgressiveImage`, `content-visibility`
  on `PostCard`, `IntersectionObserver` infinite scroll (`useInfiniteScroll`), media work offloaded
  to `src/workers/mediaProcessor.worker.ts`. List virtualization uses `@tanstack/react-virtual`
  on Home, Explore, and chat list surfaces — reuse that pattern for other long lists.

## Allowed and forbidden patterns

**Allowed / expected**

- Controller → service → Prisma, with ownership enforced by `OwnershipGuard` at the controller boundary
  (or a shared service-level check for the cases it doesn't cover) and business gating in the service.
- BullMQ for anything slow, external, or fan-out shaped.
- Redis cache for hot reads, with an explicit TTL and an invalidation path.
- Reusing `createPaginatedResult` for list endpoints.
- Zustand for client/UI state, TanStack Query for server state.
- New shared UI primitives in `src/components/ui/` when a pattern repeats.

**Forbidden without an ADR and explicit confirmation**

- Repository/mapper layers, CQRS, event sourcing, a domain event bus.
- Splitting the monolith into services, or adding a second runtime.
- A second HTTP client, a second state manager, a second styling system.
- Bypassing `ApiClient`, bypassing `ValidationPipe`, bypassing guards.
- Storing tokens in `localStorage` or exposing them to JS.
- New third-party dependencies (see `AGENTS.md`).

## Known structural gaps

Recorded in [`known-gaps.md`](./known-gaps.md). Read it before "fixing" something that looks wrong —
some of it is known and unowned, and silently changing it can break production behaviour.
