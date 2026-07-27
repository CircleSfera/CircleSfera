# Checklist — Feature

Run alongside [`pull-request.md`](./pull-request.md).

## Product

- [ ] The user problem is stated without a solution in it.
- [ ] The target user and expected frequency are identified.
- [ ] Not on the OUT OF SCOPE list in `circlesfera-documentation/00-status.md`.
- [ ] Explicit non-goals written down.
- [ ] It does not already partly exist (checked `.ai/core/glossary.md` and the schema).
- [ ] It answers the three questions from `.ai/core/identity.md`: user in control, decision
      explainable, action transparent and traceable.
- [ ] Tier/plan interaction is deliberate. Plan names come from `PlatformPlan`
      (`Premium`, `Elite Creator`, `Business`) — none invented.

## Data

- [ ] Models, fields, enums, indexes and relations designed, or explicitly unchanged.
- [ ] Migration created and `npm run prisma:check-migrations` run.
- [ ] Cascade behaviour traced for user deletion.
- [ ] Retention answered for any high-volume personal table.

## API

- [ ] Endpoints under `api/v1`, named consistently with their neighbours.
- [ ] DTOs decorated with `class-validator` for every accepted field.
- [ ] Response returns only what the client needs.
- [ ] Lists paginated via `createPaginatedResult`.
- [ ] Status codes semantically correct.
- [ ] Additive, or the breaking change is declared and coordinated.
- [ ] Swagger decorators accurate.

## Authorization

- [ ] Correct guard chosen (`JwtAuthGuard`, `JwtOptionalGuard`, `AdminGuard` with declared staff
      permissions, `SubscriptionGuard` + `@RequiresPlan`, `IdentityVerifiedGuard`).
- [ ] Ownership checked in the service.
- [ ] Rate limiting considered for anything expensive or abusable.

## Async and state

- [ ] Slow, external or fan-out work queued to an existing BullMQ queue.
- [ ] Job payloads carry ids, not entities, and processors are idempotent.
- [ ] Cache reads have an explicit TTL and a written invalidation path.
- [ ] Cache keys include the viewer dimension where the result is personalized.
- [ ] Socket events emit to the narrowest room and leak nothing.

## Frontend

- [ ] Route registered in `src/App.tsx`; heavy routes lazy-loaded.
- [ ] All API calls go through a `src/services/*.service.ts` wrapper.
- [ ] Query keys follow the domain's existing shape; every affected key invalidated.
- [ ] Loading, empty, error and offline states handled with existing components.
- [ ] Existing `src/components/ui/` primitives reused; tokens from `index.css`.
- [ ] i18n keys added to `en.json` and `es.json`.
- [ ] Components decomposed past ~300 lines.

## Edge cases exercised

- [ ] Anonymous / authenticated / suspended / banned / scheduled for deletion.
- [ ] Blocked, muted, private account, pending follow, close friends only.
- [ ] `ContentRating.MATURE`, premium and locked content, moderated content.
- [ ] Roles: `USER`, `MODERATOR` with and without the permission, `ADMIN`.
- [ ] Empty list, single item, exactly one page, last page.
- [ ] Redis unavailable (cold cache), external service failure.

## Operability

- [ ] Success signal identified (existing `InteractionEvent` / `UserEventType` or new, consent-gated).
- [ ] Failures are diagnosable: structured logs, meaningful exception types, Sentry-visible 5xx.
- [ ] Kill switch via `FeatureFlag` / `UserExperiment`, or an explicit statement that there is none.

## Documentation

- [ ] `01-product-requirements-document.md` / `04-user-stories.md` updated if product behaviour changed.
- [ ] `03-api-detailed-endpoints.md` updated if endpoints changed.
- [ ] `02-database-er-diagram.md` updated if the model changed.
- [ ] ADR added for a durable decision.
