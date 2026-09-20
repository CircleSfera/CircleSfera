# CircleSfera: Sensitive Data Logging & Telemetry Redaction Specification

> **Status:** Production / Implemented  
> **Order / Task:** Order 72 (SEC-011) — Gate A (Security)  
> **Dependencies:** `SEC-004`, `SEC-009`, `OBS-001`, `NOTIF-003`  
> **Source of Truth:** Codebase implementation (`redaction.util.ts`, `app.module.ts`, `main.ts`, `all-exceptions.filter.ts`, `slack.service.ts`, `url-sanitizer.util.ts`) and automated test suite (`logging-redaction.spec.ts`).

---

## 1. Overview and Security Objectives

Logging, distributed tracing, error tracking, and alert pipelines are essential for operational visibility. However, unredacted telemetry presents a severe security and compliance vulnerability: secrets, tokens, credentials, and payment data logged into plain-text streams can be exposed across log aggregators (e.g. Datadog/CloudWatch), telemetry platforms (Sentry), alert channels (Slack), or developer machines.

CircleSfera enforces a **zero-leakage invariant** across all observability vectors:

1. **Deterministic Request Redaction:** HTTP request bodies, cookies, authentication headers, and query parameters are redacted before being formatted into log lines by Pino.
2. **Telemetry Sanitization:** Sentry error events, stack frame variables, and breadcrumbs are filtered to remove JWTs, API keys, database connection strings, and credit card details.
3. **Exception Filter Masking:** Unhandled exceptions logged to stdout or emitted via `system.incident` events are scrubbed so that raw passwords or credentials embedded in database error messages or stack traces never reach external subscribers.
4. **ChatOps Alert Scrubbing:** Production Slack incident alerts sanitize messages, stack traces, and URL paths, preventing credential leaks in shared team channels.

---

## 2. Forbidden Fields and Sanitization Specifications

### 2.1 Sensitive Key Inventory
Any object property or JSON key matching the following canonical names (or their compound variants, regardless of case, hyphens, or underscores) is replaced with `[REDACTED]`:

| Classification | Forbidden Field Names |
|---|---|
| **Authentication & Passwords** | `password`, `current_password`, `new_password`, `confirm_password`, `old_password`, `pass`, `passwd` |
| **Tokens & Sessions** | `token`, `access_token`, `refresh_token`, `id_token`, `auth_token`, `reset_token`, `verification_token`, `csrf_token`, `csrf`, `_csrf`, `x-csrf-token` |
| **Secrets & Keys** | `secret`, `client_secret`, `jwt_secret`, `webhook_secret`, `stripe_signature`, `x-api-key`, `api_key`, `private_key`, `credentials`, `credential` |
| **MFA & Passkeys** | `totp_secret`, `totp_code`, `two_factor_secret`, `two_factor_code` |
| **Financial & Payment** | `card`, `card_number`, `credit_card`, `cvv`, `cvc`, `exp_month`, `exp_year`, `payment_method` |
| **Headers & Cookies** | `authorization`, `auth`, `cookie`, `cookies`, `set-cookie` |

### 2.2 Free-Text and Pattern-Based Redaction
Because database errors, stack traces, and third-party error responses may embed raw secrets inside free-form text strings, `redactSensitiveText` applies regex pattern matching:

- **JSON Web Tokens (JWT):** Matches `eyJ...` tokens $\ge 10$ characters per segment and replaces with `[REDACTED_JWT]`.
- **Stripe Secret / Restricted Keys:** Matches `sk_live_...`, `rk_live_...`, `sk_test_...`, `rk_test_...` and replaces with `[REDACTED_STRIPE_KEY]`.
- **Stripe Webhook Secrets:** Matches `whsec_...` and replaces with `[REDACTED_STRIPE_WEBHOOK_SECRET]`.
- **Stripe Payment Intent Client Secrets:** Matches `pi_..._secret_...` and replaces with `[REDACTED_STRIPE_CLIENT_SECRET]`.
- **Bearer & Basic Auth:** Matches `Bearer <token>` and `Basic <base64>` and replaces with `Bearer [REDACTED]` / `Basic [REDACTED]`.
- **Database & Broker Connection Strings:** Matches URIs of form `(postgres|postgresql|redis|rediss|mongodb|mysql|mariadb|amqp|amqps)://user:password@host...` and replaces password with `[REDACTED]`.
- **S3 Presigned URL Parameters:** Matches `X-Amz-Signature` and `X-Amz-Credential` query parameters and replaces values with `[REDACTED]`.

---

## 3. Pino HTTP Logger Redaction Architecture

Pino HTTP logging configured in `AppModule.forRoot` utilizes `createPinoRedactPaths()` to ensure that incoming requests and outgoing responses are redacted at the serializer level:

```
Incoming Request
       │
       ▼
[Pino HTTP Serializer]
       │ ── Redact: req.headers.authorization, req.headers.cookie, req.headers['set-cookie']
       │ ── Redact: req.body.password, req.body.refreshToken, req.body.cvv, req.body.*
       │ ── Redact: root-level and wildcard logging payloads
       ▼
Sanitized Pino Log Stream (stdout / CloudWatch)
```

Configured paths include:
- `req.headers.authorization`, `req.headers.cookie`, `req.headers['x-csrf-token']`, `req.headers['x-api-key']`, `req.headers['set-cookie']`.
- `res.headers['set-cookie']`.
- `req.body.password`, `req.body.refreshToken`, `req.body.clientSecret`, `req.body.card`, `req.body.cvv`.
- Nested wildcards: `req.body.*.password`, `req.body.*.refreshToken`, `req.body.*.secret`, `req.body.*.cvv`.
- Root-level paths (`password`, `token`, `secret`, `cvv`) and wildcard patterns (`*.password`, `*.token`, `*.secret`).

---

## 4. Sentry Telemetry Sanitization & Breadcrumb Scrubbing

Sentry is initialized in `src/main.ts` with explicit `beforeSend` and `beforeBreadcrumb` hooks backed by `scrubSentryEvent` and `scrubSentryBreadcrumb`:

1. **Request Scrubbing:**
   - `event.request.data` is deeply sanitized via `redactSensitiveData()`.
   - `event.request.headers` are filtered through sensitive key matching.
   - `event.request.cookies` are unconditionally replaced with `[REDACTED]`.
   - `event.request.url` and `event.request.query_string` are sanitized via `sanitizeUrl()` and `redactSensitiveText()`.
2. **Exception & Stack Frame Scrubbing:**
   - Exception error values (`event.exception.values[].value`) are sanitized with `redactSensitiveText()`.
   - Stack frame local variables (`frame.vars`) are sanitized via `redactSensitiveData()`.
3. **Breadcrumbs & Extras Scrubbing:**
   - Breadcrumb messages and attached payload data are sanitized before transmission.
   - `event.extra` dictionary is scrubbed recursively.

---

## 5. Global Exception Filter & Incident Escalation

`AllExceptionsFilter` (`src/common/filters/all-exceptions.filter.ts`) captures unhandled application errors:

- **Error Stack Sanitization:** Raw error stacks are sanitized via `redactSensitiveText()` before being logged via `this.logger.error()`.
- **Safe Development Responses:** In non-production environments, `responseBody.details` receives the sanitized error stack instead of raw unredacted text.
- **Incident Event Scrubbing:** The `system.incident` event emitted for HTTP 500 errors sanitizes `message` (`redactSensitiveText`), `stack` (`redactSensitiveText`), and `path` (`sanitizeUrl`).

---

## 6. ChatOps Operational Alerting (Slack)

`SlackService.sendProductionAlert` (`src/slack/slack.service.ts`) receives `system.incident` events:

- **Path Sanitization:** The request path is stripped of sensitive query parameters via `sanitizeUrl(errorInfo.path)`.
- **Message & Stack Sanitization:** `errorInfo.message` and `errorInfo.stack` are scrubbed with `redactSensitiveText()` before being formatted into Block Kit code blocks.
- **Length Bounding:** Stack traces are capped at 2,000 characters to prevent Slack message truncation.

---

## 7. Verification & Invariants

Automated testing in `src/common/testing/logging-redaction.spec.ts` verifies:
- Exact key matching and compound/casing variations.
- Non-sensitive business fields (`promptTokens`, `completionTokens`, `tokenLimit`) are preserved without false positives.
- Free-text redaction of JWTs, Stripe keys, Basic/Bearer auth, DB passwords, and S3 credentials.
- Deep object recursion and circular reference tolerance (`[CIRCULAR]`).
- Sentry event, breadcrumb, and stack frame variable scrubbing.
- `AllExceptionsFilter` masking for stdout and incident event payloads.
- Slack Block Kit payload credential masking.
