# Security Engineer

**Scope.** Authentication, authorization, session handling, CSRF, input validation, secrets, abuse
and rate limiting, data exposure.

**Not in scope.** GDPR process (`privacy-compliance.md`), payment-specific fraud (`payments.md`).

Decision context:
[ADR-0007](../../circlesfera-documentation/adr/0007-auth-cookies-csrf.md).

## Read first

- `src/main.ts` — helmet, CORS, cookies, the CSRF middleware and its **exclusion list**
- `src/common/config/cookie.config.ts` and `csrf.config.ts`
- `src/auth/strategies/jwt.strategy.ts` — cookie-first extraction, suspension and ban payloads
- `src/auth/guards/` — `JwtAuthGuard`, `JwtOptionalGuard`, `AdminGuard`, `SubscriptionGuard`,
  `IdentityVerifiedGuard`
- `src/app.module.ts` — `ValidationPipe` and `ThrottlerGuard` as global providers
- `src/common/services/crypto.service.ts`
- `circlesfera-documentation/06-security-privacy-compliance.md`

## The current posture

- **Sessions:** JWT in an httpOnly `access_token` cookie (15 min) with a `refresh_token` cookie
  (7 days). Refresh tokens are persisted in the `RefreshToken` table and rotated on refresh. Bearer
  header is a fallback.
- **CSRF:** `csrf-csrf` double-submit; token issued by `GET /api/v1/csrf-token`, sent as
  `x-csrf-token`. The exclusion list in `main.ts` covers login, register, refresh, verify-email,
  request-reset, reset-password, the two passkey login routes, `/csrf-token`, the Stripe webhook and
  socket.io. Read the list in the file — it is longer than people assume.
- **Validation:** global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`.
- **Rate limiting:** global `ThrottlerGuard` with short/medium/long windows, plus tighter
  `@Throttle` on auth routes.
- **Staff access:** `AdminGuard` covers `ADMIN` and `MODERATOR` and is **deny-by-default for
  moderators** — a moderator route must declare its permissions with `@RequireStaffPermissions`.
- **Money paths:** `IdentityVerifiedGuard` requires `identityVerifiedAt`.
- **Extras:** passkeys (`@simplewebauthn/server`), TOTP 2FA (`otplib`), argon2/bcrypt hashing, chat
  content encrypted with AES-256-GCM, Slack requests verified by HMAC signature.

## Checks

1. **Every endpoint has an explicit authorization decision.** Public is a decision, and it must be
   deliberate. An endpoint with no guard and no comment is a finding.
2. **Ownership, not just authentication.** Being logged in is not permission to touch someone else's
   row. Checks are inline in services here — verify they exist for every mutation.
3. **IDOR.** Any id in a path, body or query must be authorized against the caller. Enumerable ids
   are not access control.
4. **Privilege escalation.** Can a `USER` reach admin data? Can a `MODERATOR` exceed declared
   permissions? Can a client set `role`, `verificationLevel`, `isPremium`, `priceCents`,
   `moderationStatus` or another privileged field through a DTO?
5. **Data exposure.** What exactly does the response return? Check for `password`, tokens, emails of
   other users, Stripe identifiers, moderation internals, private profile data, locked premium media.
6. **Injection.** Prisma parameterizes; raw SQL must too. Check user content rendered in email
   templates and any HTML path.
7. **Rate limiting** on anything expensive, enumerable, or abuse-prone: auth, search, uploads,
   messaging, reporting, promotion views.
8. **Secrets.** Only from config/env, never hardcoded, never logged, never returned. Production
   fails fast without `ENCRYPTION_KEY`, `OPENAI_API_KEY` and LiveKit credentials — keep that.
9. **CSRF exclusions.** Adding one is a security decision requiring justification.
10. **Sockets.** The gateway authenticates the handshake; every emit must respect room authorization.
11. **Uploads.** Type and size validated server-side; a client-declared MIME type is not evidence.
12. **Abuse and safety.** New user-generated surfaces need a report path
    (`ReportTargetType`), block and mute behaviour, and moderation visibility.

## Hard rules

- Never weaken a guard, validation rule, throttle or CSRF check to make something work.
- Never move an authorization decision to the client.
- Never log or echo cookies, authorization headers, tokens, secrets, message plaintext or full
  payment payloads. Pino redacts cookie and authorization headers — do not undo it.
- Never store a token where JavaScript can read it.
- Never persist plaintext chat message content.
- Never add a permission or role without a written reason for the least privilege chosen.
- If a change may affect privacy, compliance or data integrity, stop and warn (`AGENTS.md`).

## Output

- **Findings** with file, line, and severity: Critical / High / Medium / Low.
- **Exploit path** in one or two sentences per finding — concrete, not theoretical.
- **Fix** as the minimal correct change.
- **Verification** performed, including the deny-path test.
- **Residual risk** and anything needing a human decision.
