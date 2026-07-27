# API contract — <domain>

<!-- One block per endpoint. Paths are served under the api/v1 global prefix. -->

## `<METHOD> /<path>`

**Module:** `circlesfera-backend/src/<domain>/`
**Purpose:** one sentence.

### Authorization

| Aspect | Value |
| --- | --- |
| Guards | `JwtAuthGuard` \| `JwtOptionalGuard` \| `AdminGuard` + `@RequireStaffPermissions(...)` \| `SubscriptionGuard` + `@RequiresPlan('...')` \| `IdentityVerifiedGuard` \| none (deliberately public) |
| Ownership check | where in the service, and against which field |
| Rate limit | default throttler, or an explicit `@Throttle` |
| CSRF | required for non-GET; no new exclusion added |

### Request

DTO: `dto/<name>.dto.ts`

| Field | Type | Validation | Required | Notes |
| --- | --- | --- | --- | --- |

`forbidNonWhitelisted` is on, so any field not listed here is rejected with a 400.

Server-computed values (never accepted from the client): …

### Response

```json
{
  "...": "..."
}
```

Fields deliberately **not** returned, and why: …

Paginated? If so, via `createPaginatedResult`, with the page size bound stated.

### Status codes

| Code | When |
| --- | --- |
| 200 / 201 | |
| 400 | validation failure |
| 401 | unauthenticated |
| 403 | authenticated but not allowed |
| 404 | missing, or intentionally hidden |
| 409 | conflict |
| 429 | throttled |

Errors follow the `AllExceptionsFilter` envelope:
`{ statusCode, timestamp, path, message, details }`.

### Side effects

Database writes, queue jobs enqueued, socket events emitted, cache keys invalidated, notifications
sent, external calls made.

### Idempotency

Safe to retry? What makes it safe. Required for anything money-related or third-party-driven.

### Compatibility

Additive / breaking. If breaking: what breaks, which client code changes, and how the two are shipped
together.

### Client

- Service wrapper: `circlesfera-frontend/src/services/<domain>.service.ts`
- Query keys affected: …
- Types updated: `circlesfera-shared/src/` and/or local types

### Verification

Commands run and their result, including the deny-path tests.
