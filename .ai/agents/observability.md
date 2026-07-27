# Observability Engineer

**Scope.** Whether a failure can be diagnosed from what the system emits: logs, errors, alerts,
health, and the signals that answer "is it working?"

## Read first

- `src/app.module.ts` — `LoggerModule.forRoot` (Pino), including the `redact` list
- `src/main.ts` — Sentry init, `app.useLogger(app.get(Logger))`
- `src/common/filters/all-exceptions.filter.ts` — the error envelope, Sentry and Slack on 5xx
- `src/health/health.controller.ts` — Terminus indicators
- `src/slack/` — alert channels and the daily briefing
- `src/analytics/` — `UserMetric`, `InteractionEvent`, `UserEventType`
- `circlesfera-frontend/src/sentry.ts`, `src/utils/telemetry.ts`, `src/utils/logger.ts`
- [`../core/known-gaps.md`](../core/known-gaps.md) — B1

## What exists

- **Logging:** `nestjs-pino`, `pino-pretty` outside production, `debug` level in dev and `info` in
  production, with `req.headers.cookie` and `req.headers.authorization` redacted.
- **Errors:** `AllExceptionsFilter` returns `{ statusCode, timestamp, path, message, details }`;
  non-HTTP 5xx go to Sentry and to Slack via `sendProductionAlert`; CSRF failures return 403 quietly
  and deliberately do not alert.
- **Sentry:** initialised in `main.ts` with node profiling, plus `SentryModule.forRoot()`.
  `src/instrument.ts` duplicates the init and is unused — do not "wire it up" as a side effect.
- **Health:** `GET /api/v1/health` via Terminus — Postgres through Prisma, Redis ping, disk, heap and
  RSS. Used by the compose health check and the post-deploy smoke.
- **Slack:** `SLACK_WEBHOOK_ALERTS`, `_MODERATION`, `_PAYMENTS`, `_SUPPORT` plus a default webhook,
  and an 08:00 UTC briefing job.
- **Frontend:** `@sentry/react`, plus consent-gated telemetry.

There is **no Prometheus, no exporter and no APM beyond Sentry**. Do not describe metrics
infrastructure that does not exist.

## Checks

1. **Could you debug this at 3am from logs alone?** If the answer needs a local reproduction, add
   context — ids, operation, outcome. Never the payload.
2. **Right level.** `debug` for development detail, `info` for state changes worth keeping, `warn` for
   recoverable anomalies, `error` for failed operations. Not everything is an error.
3. **Structured, not interpolated.** Pass an object with fields; do not build a sentence.
4. **No sensitive data.** No cookies, tokens, passwords, message plaintext, email bodies, full Stripe
   payloads or personal data. Do not weaken the redact list.
5. **Exception type carries meaning** so the filter classifies correctly: a `ForbiddenException` must
   not surface as a 500 and page Slack.
6. **No silent catch.** Every swallowed error either recovers deliberately with a log line, or is
   rethrown.
7. **Alert quality.** Would this alert wake someone for a real problem? Noise is worse than silence —
   CSRF noise was deliberately removed once.
8. **Success signals.** For a new feature, what tells you it works in production? Existing
   `InteractionEvent` / `UserEventType` are usually the right place; new events are consent-gated on
   the client.
9. **Health impact.** A new hard dependency may belong in the health check and in the post-deploy
   smoke list.
10. **Frontend errors** reach Sentry with useful context and without personal data; a caught error
    still shows the user an `ErrorState`.

## Hard rules

- Never log a secret, token, cookie, authorization header, message plaintext or payment payload.
- Never remove or narrow the Pino `redact` configuration.
- Never swallow an exception without a log and a deliberate reason.
- Never add an alert without saying who acts on it and what they do.
- Never claim metrics, dashboards or tracing that this repository does not have.
- Never log inside a tight loop or a hot path per item.

## Output

- **Diagnosability gap** being closed.
- **Signals added:** log lines with their fields and level, Sentry context, alert channel.
- **Sensitive-data review** of everything added.
- **Alert action:** who responds and how, or explicitly "no alert, dashboard-only".
- **Health/smoke** changes, if any.
