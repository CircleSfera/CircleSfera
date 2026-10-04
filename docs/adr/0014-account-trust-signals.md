# ADR-0014 — Account trust signals

- **Status:** Accepted (amended 2026-08-21)
- **Date:** 2026-08-21
- **Deciders:** CircleSfera engineering / product
- **Scope:** auth | trust & safety | data | product

## Context

Registration issued a session without proving a human or a working mailbox. The public “verified” badge mixed KYC (`identityVerifiedAt`) with paid plan tiers. Ops had no hashed clustering signals or funnel metrics for signup abuse.

## Decision

CircleSfera uses:

1. **Cloudflare Turnstile** on register and login (ops kill switch `turnstile_required`).
2. **Email verification gate** on write surfaces (ops kill switch `email_verification_required`), with authenticated resend.
3. **First-party FingerprintJS OSS** + HMAC of visitor id / UA (`ABUSE_HASH_PEPPER`) as `DeviceSignal.visitorHash`.
4. **Plaintext IP retention for the life of the account** (`signupIp`, `lastIp`), plus HMAC indexes (`signupIpHash`, `lastIpHash`) for clustering. Public profile APIs never expose IP. The account holder receives IPs in GDPR export; staff see them in admin. Purpose: security, abuse, linked-account investigation — disclosed under product transparency.
5. **Plan badge ≠ KYC**: `verificationLevel` follows platform plans; `identityVerifiedAt` is independent.
6. **Public about-account facts** including strikes and staff-applied `botLabeledAt` (appealable via `AppealTargetType.BOT_LABEL`).
7. **Admin-only trust score** computed from explicit factors — never used to silently reduce reach.

## Alternatives considered

| Option | Why not / superseded |
| --- | --- |
| Silent reach penalty / shadowban | Violates product principles |
| Hash-only IP (no plaintext) | Superseded: product stores IP while the account exists; transparency via export + admin + policy |
| FingerprintJS Pro | Privacy cost and third-party graph |
| Google reCAPTCHA | Prefer Turnstile; avoid Google dependency |
| Public “bot score” without staff action | Opaque and unappealable |

## Consequences

**Accepted costs.** Turnstile and optional fingerprint are new processors; Brevo delivery blocks writes until email verify; Premium buyers no longer get an “identity” meaning from the blue check alone; plaintext IP is personal data retained for account lifetime and must stay out of public APIs and casual logs.

**Constraints.** Raw IP is admin + GDPR-export only. Trust score must not feed ranking. Schema changes ship with migrations.

## Implementation anchors

- `circlesfera-backend/src/common/abuse/`
- `circlesfera-backend/src/auth/guards/email-verified.guard.ts`
- `circlesfera-backend/prisma/schema.prisma` — `DeviceSignal`, bot label fields, `signupIp` / `lastIp`
- ADR index: `circlesfera-documentation/adr/README.md`
