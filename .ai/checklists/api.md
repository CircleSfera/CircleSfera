# Checklist — API change

## Before adding anything

- [ ] Grepped the controllers to confirm the endpoint does not already exist.
- [ ] Read the neighbouring routes in the same controller for naming and shape.

## Shape

- [ ] Route lives under the `api/v1` global prefix.
- [ ] Path and casing consistent with its neighbours.
- [ ] Verb semantics correct: GET has no side effects, POST creates or acts, PATCH partially updates,
      DELETE removes.
- [ ] Status codes are meaningful: 200/201, 204 empty success, 400 validation, 401 unauthenticated,
      403 forbidden, 404 missing or intentionally hidden, 409 conflict, 429 throttled.
- [ ] Error responses come from thrown Nest exceptions, so `AllExceptionsFilter` produces the standard
      `{ statusCode, timestamp, path, message, details }` envelope.
- [ ] Semantic message strings the frontend branches on (`ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED`) are
      unchanged.

## Request

- [ ] A DTO exists and every accepted field is decorated. `forbidNonWhitelisted` rejects the rest.
- [ ] The `ValidationPipe` configuration was not loosened to make a payload pass.
- [ ] No client-supplied field can set a privileged value (`role`, `verificationLevel`, `isPremium`,
      `priceCents`, `moderationStatus`, another user's id).
- [ ] Amounts and prices are computed server-side, never accepted from the client.
- [ ] File uploads validate type and size server-side.

## Response

- [ ] No raw Prisma entity returned — fields are chosen explicitly.
- [ ] No `password`, token, other users' emails, moderation internals, or locked premium media.
- [ ] Lists use the shared pagination DTO and `createPaginatedResult`.
- [ ] Filters and sorts are index-backed and bounded.
- [ ] Money in integer cents, currency stated where relevant.

## Authorization

- [ ] Explicit guard, or a deliberate and noted decision to be public.
- [ ] Ownership verified in the service for mutations.
- [ ] Plan gating (`SubscriptionGuard` + `@RequiresPlan`) and KYC gating
      (`IdentityVerifiedGuard`) applied where the domain requires it.
- [ ] Rate limiting appropriate for cost and abuse potential.
- [ ] No new CSRF exclusion in `src/main.ts` (or, if unavoidable, security-reviewed and justified).

## Compatibility

- [ ] Change is additive, or the breaking change is declared with a coordinated frontend update.
- [ ] No field renamed, removed or retyped without a migration plan for clients.
- [ ] Validation was not tightened in a way that rejects previously accepted requests.
- [ ] Idempotency preserved for retryable and third-party-driven calls; Stripe webhook deduplication
      via `WebhookEvent` intact.

## Client and docs

- [ ] The matching `circlesfera-frontend/src/services/*.service.ts` wrapper and its types updated.
- [ ] Affected TanStack Query keys identified and invalidated.
- [ ] Swagger decorators accurate.
- [ ] `03-api-detailed-endpoints.md` synced.

## Verification

- [ ] Backend `npm test` and `npm run build` pass.
- [ ] Backend `npm run test:e2e` run for contract behaviour: auth, CSRF, validation rejection, status
      codes.
- [ ] Deny paths tested: unauthenticated, forbidden, invalid payload.
