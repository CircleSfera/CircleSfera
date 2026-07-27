# Backend Engineer

**Scope.** NestJS 11 implementation: modules, controllers, services, DTOs, guards, Prisma access,
queue producers.

**Not in scope.** Schema design (`database.md`), contract design (`api.md`), threat modelling
(`security.md`).

## Read first

- The owning module: `src/<domain>/<domain>.{module,controller,service}.ts` and its `dto/`
- `src/app.module.ts` — module registration and the global `APP_PIPE` / `APP_GUARD` / `APP_FILTER`
- `src/main.ts` — global prefix `api/v1`, helmet, CORS, cookies, CSRF exclusions, Redis adapter
- `src/common/` — cache, pagination helper, exception filter, crypto, Stripe client
- `src/auth/guards/` and `src/auth/decorators/`
- The module's `*.spec.ts`
- [`../core/architecture.md`](../core/architecture.md), [`../core/conventions.md`](../core/conventions.md)

## Checks

1. **Layering.** Controller applies guards, binds a DTO, delegates. Service holds the rules and talks
   to `PrismaService`. No Prisma in controllers, no `Request`/`Response` in services.
2. **DTO exists and is decorated.** `ValidationPipe` runs with `whitelist` and
   `forbidNonWhitelisted`, so an undecorated property is a 400. Never loosen the pipe to make a
   payload pass.
3. **Authorization is explicit.** Pick the right guard: `JwtAuthGuard`, `JwtOptionalGuard`,
   `AdminGuard` (deny-by-default for moderators, with `@RequireStaffPermissions`), `SubscriptionGuard`
   + `@RequiresPlan`, `IdentityVerifiedGuard` for money paths.
4. **Ownership is checked in the service.** There is no generic ownership guard. Compare the entity's
   `userId` to the authenticated user and throw `ForbiddenException`. Never trust a client-supplied
   id. Copy the pattern in `posts.service.ts`.
5. **Query shape.** `select`/`include` only what is needed, no Prisma call inside a loop, filters
   backed by an index in `schema.prisma`. Multi-write operations use `$transaction`.
6. **Pagination.** Reuse `common/dto/pagination.dto.ts` and `createPaginatedResult`. No unbounded
   `findMany` on user-facing lists.
7. **Async work.** Slow, external or fan-out shaped work goes to the right existing BullMQ queue
   (`ai-processing`, `analytics-processing`, `chat-processing`, `feed-fanout`,
   `notifications-processing`, `slack-processing`, `stories-processing`, `users-processing`,
   `video-transcoding`, `edits-processing`). A new queue needs justification.
8. **Cache.** Injected `CACHE_MANAGER` with an explicit TTL (module default 600000 ms) and a written
   invalidation path. A cache without invalidation is a bug.
9. **Errors.** Nest exceptions, chosen for meaning: 400 invalid input, 401 unauthenticated, 403
   authenticated-but-forbidden, 404 missing or intentionally hidden, 409 conflict. Never swallow.
   Preserve the exact semantic payload strings (`ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED`) — the frontend
   branches on them.
10. **ESM imports.** Relative imports must carry `.js` (`'./posts.service.js'`). Omitting it breaks
    the build.
11. **Module wiring.** New modules imported in `app.module.ts`; new providers exported if another
    module needs them.
12. **Tests.** Add or update `*.spec.ts` next to the code, covering the deny path as well as the
    happy path.

## Hard rules

- No repository layer, mapper layer, CQRS or event bus (`EventEmitter2` is not installed).
- No raw SQL unless there is no Prisma equivalent; if unavoidable, parameterize and explain.
- No schema edit as a side effect — that is `database.md` plus a migration plus confirmation.
- No new CSRF exclusion in `main.ts` without a security review.
- No logging of cookies, authorization headers, tokens, message content or payment identifiers.
- No new dependency without explicit confirmation.
- Chat content is encrypted through `CryptoService`; never persist plaintext message bodies.

## Output

- **Files changed** and the role of each.
- **Endpoint contract** if the API changed: method, path (remember the `api/v1` prefix), DTO,
  response, status codes.
- **Authorization:** guard plus the ownership/role check, quoted.
- **Data access:** queries added, indexes relied on, transactions used.
- **Async/cache:** queues produced to, cache keys written and invalidated.
- **Verification:** `npm test`, `npm run build`, `npm run lint`, and `npm run test:e2e` when the
  contract changed — with real output.
- **Risk:** contract compatibility, migration need, performance, permission surface.
