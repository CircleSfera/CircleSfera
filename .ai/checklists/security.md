# Checklist — Security and privacy

Run whenever a change touches auth, permissions, personal data or money.

## Authentication and session

- [ ] Auth stays cookie-based: httpOnly `access_token`, rotating `refresh_token` persisted in
      `RefreshToken`.
- [ ] No token stored anywhere JavaScript can read it.
- [ ] Suspension and ban still enforced (`suspendedUntil`, `isActive`) at login and in the JWT strategy.
- [ ] No new CSRF exclusion in `src/main.ts`, or it is justified and reviewed.

## Authorization

- [ ] Every touched endpoint has an explicit decision; public is deliberate and noted.
- [ ] Ownership checked in the service for every mutation of user-owned data.
- [ ] Every client-supplied id is authorized against the caller (no IDOR).
- [ ] No privilege escalation path: a `USER` cannot reach admin data; a `MODERATOR` cannot exceed its
      declared `@RequireStaffPermissions`.
- [ ] No privileged field settable through a DTO (`role`, `verificationLevel`, `isPremium`,
      `priceCents`, `moderationStatus`, `status`).
- [ ] Plan gating and `IdentityVerifiedGuard` applied where the domain requires them.
- [ ] Authorization is decided server-side per request and never cached.

## Input and output

- [ ] All external input validated by a decorated DTO; `whitelist` / `forbidNonWhitelisted` intact.
- [ ] Uploads validated server-side for type and size; a client MIME type is not trusted.
- [ ] Raw SQL, if any, is parameterized.
- [ ] User content is safe in email templates and any HTML rendering path.
- [ ] Responses expose nothing extra: no `password`, tokens, other users' emails, moderation internals,
      or locked premium media.

## Abuse

- [ ] Rate limiting appropriate for cost and enumerability (auth, search, uploads, messaging,
      reporting, promotion views).
- [ ] New user-generated surfaces have a report path and honour `Block` and `Mute`.
- [ ] Socket emits go to the narrowest room and carry nothing the recipient may not see.

## Secrets

- [ ] No hardcoded secret, key or token.
- [ ] Nothing secret logged, echoed or returned.
- [ ] Production fail-fast preserved for `ENCRYPTION_KEY`, `OPENAI_API_KEY` and LiveKit credentials.
- [ ] New env vars added to `.env.example`, `ENV_PRODUCTION_B64` and the consuming compose service.
- [ ] Pino `redact` configuration untouched.

## Personal data

- [ ] Purpose stated for any new personal field or event.
- [ ] Minimized — every field is actually used.
- [ ] Retention answered, with the enforcing mechanism.
- [ ] Included in the GDPR export, or explicitly excluded with a reason.
- [ ] Deletion path verified against Prisma `onDelete` — no orphaned personal rows.
- [ ] Telemetry stays behind the consent gate.
- [ ] No new third-party processor without explicit confirmation.
- [ ] Cache keys, socket rooms and export bundles cannot mix users.
- [ ] Chat content still encrypted through `CryptoService`; no plaintext persisted.

## Money (if applicable)

- [ ] Amounts computed server-side from the database or `gift-catalog.ts`.
- [ ] The Stripe `application_fee` and the local 80% ledger credit agree, with the same rounding.
- [ ] Webhook handling remains idempotent via `WebhookEvent`; failures still return 5xx so Stripe
      retries.
- [ ] Entitlement verified server-side (`PostUnlock` / `StoryUnlock` / active `CreatorSubscription` /
      ownership), never from the client.
- [ ] A `Transaction` row is written with the correct `TransactionType`.

## Verification

- [ ] Deny paths tested: unauthenticated, forbidden, wrong owner, missing permission, invalid payload.
- [ ] Findings recorded with severity, file, line and the concrete exploit path.
- [ ] Residual risk stated rather than omitted.
- [ ] If the change may affect privacy, compliance or data integrity, it was flagged before
      implementation.
