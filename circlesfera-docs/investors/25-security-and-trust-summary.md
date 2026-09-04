# CircleSfera
## Security and trust summary

**Your World, Connected.**  
August 2026

Two-page summary for non-technical partners. **Shipped capabilities only.** Full detail: [`06-security-privacy-compliance.md`](../../circlesfera-documentation/06-security-privacy-compliance.md).

---

## Trust model

CircleSfera separates three ideas investors often conflate:

1. **Platform plan** — user pays CircleSfera for features. Not proof of identity.
2. **Identity verification** — required before creator commerce (KYC gate).
3. **Trust operations** — staff moderation on a **separate admin application** with its own identities and mandatory MFA.

Trust score and device signals exist for abuse detection; they **do not silently reduce reach**.

---

## Authentication (shipped)

- Email and password with verification gate on sensitive writes
- Passkeys (WebAuthn)
- HttpOnly session cookies with CSRF protection on mutating requests
- Short-lived access tokens; revocable refresh tokens
- Argon2 password hashing

---

## Authorization (shipped)

- Consumer accounts cannot access staff trust tools
- Admin operators use separate identities with role-based permissions
- Moderators: deny-by-default on sensitive actions
- Creator commerce guarded by identity verification; amounts set server-side

---

## Data protection (shipped)

| Control | Status |
| --- | --- |
| TLS in transit | Yes |
| Encryption at rest (DB, storage) | Yes — infrastructure layer |
| Private messages encrypted at rest | Yes — with key rotation support |
| Secrets not in client | Yes — production fail-fast on missing keys |
| PII minimization in logs | Policy — structured logging without unnecessary PII |

---

## Privacy and GDPR (shipped)

| Right / control | Status |
| --- | --- |
| Age 16+ on registration | Client and server |
| Cookie consent | Telemetry gated |
| Data export | Includes stories, likes, notifications, settings, appeals, collections, transactions |
| Account deletion | Grace period; restore on login during window; hard-delete cron |
| Purpose limitation | Documented in compliance materials |

---

## Moderation and safety (shipped)

| Control | Status |
| --- | --- |
| User reporting | Content and accounts |
| Moderation actions | Warn, suspend, restore |
| Author notification | Where appropriate on limit |
| Appeals | User-facing in Settings |
| Anti-shadowban policy | No silent reach reduction as management tool |
| Report queue | Staff assignee, claim, audit trail |

---

## Payments security (shipped)

- Stripe Connect Express; platform never holds creator bank details
- Webhook deduplication; retries on failure
- Identity verified before tips, unlocks, gifts, checkout
- Dispute handling revokes entitlements where applicable

---

## What is not claimed

| Item | Status |
| --- | --- |
| SOC2 | Out of scope |
| Public bug bounty | Out of scope |
| Designated DPO | Founder to appoint if required by scale/jurisdiction |
| Field-level encryption on all PII columns | Not claimed — at-rest + access controls |

---

## Incident and disclosure

Responsible disclosure contact: `SECURITY.md` in repository root. Production runs on OVH VPS with Docker Compose; scaling and formal SOC programmes are future work.

CircleSfera  
Your World, Connected.
