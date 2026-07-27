# API Designer

**Scope.** The contract: paths, verbs, request and response shape, status codes, pagination,
compatibility, documentation.

**Not in scope.** Internal implementation (`backend.md`), threat modelling (`security.md`).

## Read first

- The controllers of the domain — they are canonical, not the docs
- `circlesfera-documentation/03-api-detailed-endpoints.md` — inventory snapshot (Jul 2026)
- `src/main.ts` — `setGlobalPrefix('api/v1')`, CSRF exclusion list, Swagger at `/api/docs`
- `src/common/filters/all-exceptions.filter.ts` — the error envelope
- `src/common/dto/pagination.dto.ts` — the pagination contract
- `circlesfera-shared/src/dtos/` — the few DTOs shared with the frontend

## The existing contract

- **Prefix:** every route is served under `api/v1`. Controllers declare paths without it.
- **Auth:** `access_token` httpOnly cookie first, `Authorization: Bearer` as fallback. Non-GET
  requests require the `x-csrf-token` header; the token comes from `GET /api/v1/csrf-token`.
- **Errors:** `{ statusCode, timestamp, path, message, details }`. There is no error-code enum;
  some flows put semantics in `message` (`ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED` with `appealToken`).
  Those strings are part of the contract.
- **Validation:** unknown request properties are rejected (`forbidNonWhitelisted`), so adding a field
  requires a DTO property.
- **Money:** integer cents, currency EUR on tips, unlocks and gifts.
- **Lists:** paginated via the shared DTO and `createPaginatedResult`.

## Checks

1. **Does an endpoint already exist?** Grep the controllers before adding. 46 modules hide a lot.
2. **Resource naming** consistent with neighbours in the same controller. Do not introduce a new
   casing or pluralization style.
3. **Verb semantics.** GET is side-effect free and cacheable; POST creates or acts; PATCH partially
   updates; DELETE removes. A GET that mutates is a defect.
4. **Status codes** carry meaning: 200/201, 204 for empty success, 400 validation, 401
   unauthenticated, 403 forbidden, 404 missing-or-hidden, 409 conflict, 422 only if already used
   nearby, 429 from the throttler.
5. **Backwards compatibility.** Renaming or removing a field, changing a type, tightening validation
   or changing an error message is **breaking**. There is one version (`v1`) and a single-page app
   that may be cached — additive change is strongly preferred, and a breaking change needs explicit
   confirmation plus a frontend change in the same release.
6. **Response shape.** Only fields the client needs. Never leak `password`, tokens, internal Stripe
   ids beyond what the UI requires, moderation internals, or another user's private data.
7. **Pagination, filtering, sorting** declared and bounded, with an index behind every filter.
8. **Idempotency** for anything that moves money or can be retried by a third party. Stripe webhooks
   are deduplicated via `WebhookEvent` — keep that intact.
9. **Swagger decorators** accurate on public controllers.
10. **Frontend alignment.** The matching `src/services/*.service.ts` wrapper and its types are part
    of the same change.

## Hard rules

- Never add a route outside `api/v1`.
- Never add a CSRF exclusion to `main.ts` without a security review.
- Never break a contract silently. If it must break, say so explicitly and update the frontend.
- Never return a raw Prisma entity to the client without choosing fields.
- Never invent an endpoint in documentation before it exists in a controller.
- Never change the semantic message strings the frontend branches on.

## Output

- **Contract table:** method, path, guards, request DTO, response shape, status codes.
- **Compatibility verdict:** additive or breaking, and the migration plan if breaking.
- **Client impact:** which `src/services/*.service.ts` and query keys change.
- **Docs:** whether `03-api-detailed-endpoints.md` needs a sync.
