# ADR-0023: External-provider failure classification and retry/idempotency/escalation policy

- **Status:** Accepted
- **Date:** 2026-09-25
- **Deciders:** CircleSfera engineering
- **Scope:** backend, reliability

## Context

INT-001 (Notion — CircleSfera Architecture Refactoring Backlog) requires: "Stripe/OpenAI/Brevo/Slack/
Push/LiveKit operations need transient/permanent/reconciliation classification," target state "Explicit
timeout, retry, idempotency and escalation policy," acceptance criterion "Critical provider operations
have documented failure semantics." Depends on QUEUE-001 (BullMQ retry/backoff/timeout/retention policy,
`circlesfera-backend/src/common/constants/queue-policy.constants.ts`) and OBS-003 (queue/realtime/media
operational metrics), both already accepted.

Verified current state (this ADR's originating audit, `circlesfera-backend/src/`) before this change:

- **Stripe** (`common/stripe/stripe.service.ts`, `payments/payments.service.ts`) had the most mature
  infrastructure of any provider audited — an explicit client timeout (20s) and SDK-level retry
  (`maxNetworkRetries: 2`), a genuinely solid idempotent webhook state machine (dedup by Stripe's
  `event.id`, `PENDING/FAILED/PROCESSED` states, lease-based crash recovery, a `@Cron` reconciliation
  job for stuck events), and explicit Stripe `idempotencyKey`s on checkout/refund/customer creation. But
  **zero error-type classification anywhere** — nothing distinguished a permanent `StripeCardError`/
  `StripeInvalidRequestError` from a transient `StripeConnectionError`/`StripeRateLimitError`.
- **OpenAI** (`ai/ai.service.ts`, `ai/processors/ai.processor.ts`) had an explicit client timeout (60s)
  and SDK-level retry (`maxRetries: 2`). BullMQ's `UnrecoverableError` (skip remaining retry attempts)
  was already used, but only for job-payload validation (missing fields, record not found) — never for
  an actual OpenAI API error. A permanent OpenAI failure (400 content-policy rejection, bad API key)
  burned the full `attempts: 4` exponential-backoff BullMQ retry cycle identically to a transient network
  blip.
- **Brevo** (`email/email.service.ts`) was the sharpest gap. `sendMail` wrapped the Brevo SDK call in a
  try/catch that only logged on failure and never propagated, by explicit design ("a failed email must
  not block user-facing flows"). No SDK-level timeout or retry config; not queued. Called synchronously,
  inline, from `auth.service.ts`'s registration/password-reset handlers. A transient Brevo outage
  silently and permanently lost a password-reset email (1-hour token, time-sensitive) with zero automatic
  recovery — the caller's HTTP handler returned success regardless of whether the email actually sent.
- **Slack** (`slack/slack.service.ts`) had an explicit per-request timeout (5s) via raw `axios.post`, no
  SDK, no retry, no queue; every send funneled through one private `sendMessage` method that logged and
  dropped on failure. Reasonable for routine notifications, but `handleSystemIncident` exists
  specifically to alert humans about incidents — if Slack itself were down during an infra incident (a
  plausible correlated failure), the one alert meant to surface that was silently lost with no fallback
  channel.
- **Push** (`push/push.service.ts`, Web Push/VAPID) already had the best failure classification of any
  provider: an explicit `statusCode === 404 || statusCode === 410` check treats a dead subscription as
  permanent (deletes it) versus any other status (logs and gives up, no retry). `Promise.allSettled`
  across a user's devices so one failing device doesn't block the others. No explicit SDK timeout. Lower
  severity than the others by nature of the medium (best-effort, non-critical).
- **LiveKit** (`live/live.service.ts`) has **no applicable failure surface**. The backend only signs
  `AccessToken` JWTs locally — no `RoomServiceClient`/`EgressClient` or any server-side call to LiveKit's
  API exists anywhere in the codebase. Nothing to classify.

## Decision

Per-provider, proportionate to what the audit found — not a single generic "retry everything" policy,
because a provider's own state machine, idempotency guarantees, and criticality differ too much for
one policy to fit all six:

### 1. Brevo — move to BullMQ-backed delivery with real retry (the only provider needing new queue infra)

New `EMAIL_PROCESSING` queue (`queue-policy.constants.ts`, `EVENT_DISTRIBUTION` workload class,
`attempts: 4`, exponential backoff from 3s — resilient to a transient outage within the 1-hour
password-reset token window). `EmailService`'s public `sendXEmail` methods now enqueue
(`queueMail`) instead of calling Brevo inline; a new `EmailProcessor` performs the actual send
(`deliverMail`), which now **throws** on failure instead of swallowing it, so BullMQ retries it.
`isTransientBrevoFailure` classifies by `BrevoError.statusCode`: 429/5xx/unknown are transient (worth
retrying), any other 4xx is permanent (`UnrecoverableError`, skip remaining attempts — a bad recipient
address will not become valid on retry). Explicit client `timeoutInSeconds: 15`; SDK `maxRetries`
reduced from its default (2) to 1, since BullMQ's own backoff now provides the broader retry window and
compounding both was pointless. The existing per-recipient rate-limit quota (unchanged logic) now lives
in `deliverMail`, evaluated per delivery attempt rather than per enqueue.

### 2. Stripe — add classification, log it at the two highest-value call sites, keep the existing idempotency/reconciliation infrastructure as-is

`classifyStripeError` (`common/stripe/stripe.service.ts`) checks `instanceof` against Stripe's typed
error classes: `StripeConnectionError`/`StripeAPIError`/`StripeRateLimitError` are transient; everything
else (`StripeCardError`, `StripeInvalidRequestError`, `StripeAuthenticationError`,
`StripePermissionError`, `StripeIdempotencyError`, `StripeSignatureVerificationError`) is permanent —
all will fail identically on an unmodified retry. Applied as classified logging (not a behavior change)
at `PaymentsService.createCheckout`'s Stripe call and `processWebhookEvent`'s dispatch failure path —
the two highest-value observability points, without changing the HTTP status codes or error shapes
already returned to callers (a contract change was out of scope for this pass; see Alternatives
Considered). The webhook state machine's existing idempotency/reconciliation design was not touched —
it was already correct and is the reference pattern the weaker providers were measured against.

### 3. OpenAI — wire the existing `UnrecoverableError` mechanism to actual provider errors, not just payload validation

`classifyOpenAIError` (`ai/ai.service.ts`) checks `instanceof OpenAI.APIError` and its `.status`: 429
and 5xx are transient; other 4xx (400/401/403/404/409/422) are permanent. `AIProcessor`'s five job
handlers (`generate-embedding`, `generate-profile-embedding`, `moderate-content`, `generate-alt-text`,
`transcribe-edit-clip`) now route every caught error through a shared `rethrowClassified` helper: a
permanent OpenAI failure is wrapped in `UnrecoverableError` (skip the remaining `attempts: 4` BullMQ
retries — they cannot succeed); anything else is rethrown unchanged for BullMQ's existing backoff.

### 4. Slack — retry with backoff at the single shared send path, plus a distinctive escalation log line on total failure

All Slack sends (incidents, moderation, payments, support) already funneled through one private
`sendMessage` method — the fix lives entirely there, covering every call site uniformly rather than
per-caller. Up to 3 attempts with linear backoff (300ms, 600ms); on final failure, logs a distinctive
`SLACK_DELIVERY_FAILED` marker (grep-able even if Slack and whatever downstream log aggregation exists
both need investigating). Deliberately **not** routed through BullMQ/the existing `SLACK_PROCESSING`
queue: that queue depends on Redis, and an infra incident severe enough to take Slack down is a
plausible correlated failure with Redis trouble too — adding a new dependency to the one alert meant to
fire *during* an infra incident would be the wrong trade. All Slack sends were already fire-and-forget
(`.catch()`, never `await`ed in an HTTP response path), so the added retry delay costs nothing
user-facing.

### 5. Push — no change

Already has the best classification of any provider in this audit (404/410 permanent-delete vs. any
other status silent-drop). Genuinely lower severity by nature of the medium and already reviewed;
adding a fuller transient-retry path was assessed as effort disproportionate to the risk for a
best-effort notification channel.

### 6. LiveKit — no change, documented as out of scope

No server-side LiveKit API call exists in the codebase to classify. If one is ever added (e.g.
`RoomServiceClient` for moderation/recording), it should be brought under this same classification
discipline at that time — not before, since there is nothing to classify today.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Reshape Stripe-facing HTTP endpoints' status codes based on `classifyStripeError` (e.g. 503 for transient, 4xx for permanent) | A genuine API contract change (`payments.controller.ts` currently returns a generic 500 for any unhandled Stripe error) requiring its own explicit confirmation, separate from "add classification" — deferred rather than bundled in under a broader approval than was actually given. Classification is applied for logging/observability now; the contract question is open for a future pass if warranted. |
| Route Slack `handleSystemIncident` through BullMQ (reusing the existing `SLACK_PROCESSING` queue) | Adds Redis as a new dependency for the one alert specifically meant to fire during infra trouble, where Redis being down is a plausible correlated failure — would trade "lost on Slack failure" for "also lost on Redis failure." A lightweight in-process retry keeps the blast radius smaller for this specific critical path. |
| Full retry/backoff for Push notification delivery | Push is inherently best-effort (the OS/browser push service itself already has its own delivery/retry semantics the app doesn't control); the existing 404/410-vs-other classification was judged proportionate, and adding queue-backed retry here was lower priority than the four providers with real gaps. |
| A single generic `classifyProviderError` shared across all providers | Each SDK's error taxonomy is shaped differently (Stripe's typed error classes, OpenAI's `APIError.status`, Brevo's `BrevoError.statusCode`) — a generic abstraction would either lose precision or require an adapter layer disproportionate to three small, independently-testable functions. |

## Consequences

**Email delivery is now asynchronous.** `sendVerificationEmail`/`sendPasswordResetEmail`/etc. return as
soon as the job is enqueued, not once Brevo has responded — this was already effectively true from the
caller's perspective (the old code never propagated failure either), but the actual send now happens
on a BullMQ worker with real retry, meaning transient Brevo failures self-heal within the queue's
backoff window instead of being silently and permanently dropped. Requires Redis/BullMQ to be up for
email to send at all, which was already a dependency for the rest of the app's background processing.

**OpenAI and Stripe error handling gained classification helpers (`classifyOpenAIError`,
`classifyStripeError`, `isTransientBrevoFailure`) as new, independently unit-tested exports.** No
existing call site's return type or thrown-error shape changed for OpenAI or Stripe — only whether a
BullMQ job's remaining retry attempts are burned on a request that cannot succeed.

**Slack notifications gained a background retry delay (up to ~900ms worst case) before giving up.**
None of the five call sites `await` this in an HTTP response path, so this doesn't add latency to any
user-facing request.

**What this does not decide.** Whether Stripe-facing HTTP endpoints should return different status
codes per failure class (see Alternatives Considered) is an open question for a future pass, not
resolved here. Whether LiveKit ever needs server-side API calls (moderation, forced disconnect,
recording) is a separate, unrelated product question this ADR takes no position on.

## Implementation anchors

- `circlesfera-backend/src/common/constants/queue-policy.constants.ts` — new `EMAIL_PROCESSING` queue
  policy.
- `circlesfera-backend/src/email/email.service.ts`, `src/email/processors/email.processor.ts` — queued
  Brevo delivery, `isTransientBrevoFailure`.
- `circlesfera-backend/src/common/stripe/stripe.service.ts` — `classifyStripeError`.
- `circlesfera-backend/src/payments/payments.service.ts` — classified logging at checkout creation and
  webhook dispatch failure.
- `circlesfera-backend/src/ai/ai.service.ts`, `src/ai/processors/ai.processor.ts` —
  `classifyOpenAIError`, `rethrowClassified`.
- `circlesfera-backend/src/slack/slack.service.ts` — `sendMessage`'s retry-with-backoff and
  `SLACK_DELIVERY_FAILED` escalation log.
- `circlesfera-backend/src/push/push.service.ts` — pre-existing 404/410 classification, unchanged,
  cited here as the reference pattern for "already correct."
