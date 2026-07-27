# CircleSfera — security-sensitive code

Activation: **Glob** — `circlesfera-backend/src/auth/**`, `circlesfera-backend/src/admin/**`,
`circlesfera-backend/src/main.ts`, `circlesfera-backend/src/common/config/**`,
`circlesfera-backend/src/common/services/crypto.service.ts`.

Preserve the current posture rather than redesign it. Auth is httpOnly cookies (15 min access, 7 day
rotated refresh), CSRF is `csrf-csrf` double-submit, and `AdminGuard` is deny-by-default for
moderators.

Non-negotiable in this scope:

- Every endpoint has an explicit authorization decision. Public is a decision and must be
  deliberate.
- Ownership is checked in the service for every mutation of user-owned data.
- Adding an entry to the CSRF exclusion list in `src/main.ts` is a security decision needing
  justification, not a fix for a failing request.
- No privileged field is settable from a DTO: `role`, `verificationLevel`, `isPremium`,
  `priceCents`, `moderationStatus`, `status`, another user's id.
- Never log or return a secret, token, cookie, authorization header, message plaintext, full payment
  payload or another user's personal data. Do not weaken the Pino `redact` list.
- Never cache an authorization decision, and never omit the viewer dimension from a personalized
  cache key.
- Test the **deny** path, not only the happy path.
- If a change may affect privacy, compliance or data integrity, stop and warn before proceeding.

Full posture, threat checks and audit process:

@/.ai/agents/security.md
@/.ai/checklists/security.md
