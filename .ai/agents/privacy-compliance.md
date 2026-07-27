# Privacy and Compliance

**Scope.** Personal data: what is collected, why, for how long, who can see it, how it is exported
and deleted, and what consent gates it.

**Not in scope.** Attack surface (`security.md`), moderation policy (`trust-and-safety.md`).

## Read first

- `circlesfera-documentation/06-security-privacy-compliance.md`
- [`../core/identity.md`](../core/identity.md) §responsible data handling
- `src/users/gdpr.processor.ts` and the `users-processing` queue registration
- `src/maintenance/maintenance.service.ts` — retention crons
- `schema.prisma`: `User` (`deletedAt`, `scheduledDeletionAt`, `dateOfBirth`), `UserSettings`,
  `DataExportRequest` (+ `ExportStatus`), `InteractionEvent`, `PostView`, `StoryView`,
  `SearchHistory`, `AdminAuditLog`
- `circlesfera-frontend/src/utils/cookieConsent.ts`, `src/utils/telemetry.ts`,
  `src/components/CookieConsent.tsx`

## What already exists

- **Account deletion:** a `scheduledDeletionAt` grace period; logging in during the window restores
  the account; Settings can cancel it; a hard-delete cron plus BullMQ finishes the job.
- **Data export:** `DataExportRequest` covers stories, likes, notifications, settings, appeals,
  collections and transactions.
- **Consent:** `CookieConsent` is mounted and telemetry is gated behind it.
- **Age:** minimum 16 enforced on both client and server at registration.
- **Encryption:** chat content is encrypted at rest; `ENCRYPTION_KEY` is required in production, with
  `ENCRYPTION_KEY_LEGACY` as a decrypt fallback for rotation.

## Checks

1. **Is this personal data?** Anything identifying or linkable to a user, including ip-derived
   signals, device data, behavioural events and free-text content.
2. **Purpose and basis.** Why is it collected, what legitimate purpose does it serve, and can that be
   stated to the user in plain language?
3. **Minimization.** Is every field actually used? Unused personal fields are liabilities, not
   options.
4. **Retention.** How long, enforced by what? A new high-volume personal table needs a retention cron
   in `src/maintenance/` or an explicit statement of why it is retained indefinitely.
5. **Export coverage.** New personal data must appear in the GDPR export, or you must justify why not.
6. **Deletion coverage.** Trace what happens on hard delete. Check Prisma `onDelete` behaviour: does
   the new relation cascade, orphan, or block deletion? Orphaned personal rows are a compliance
   defect.
7. **Consent gating.** Analytics and non-essential telemetry only fire after consent. Never move a
   tracking call outside that gate.
8. **Third-party flow.** Which processor receives it — Stripe, OpenAI, LiveKit, Brevo, Sentry,
   Cloudinary/S3? Sending user content to a new processor is a compliance decision requiring
   confirmation.
9. **Sentry and logs.** Errors must not carry personal data or message content.
10. **Access control on personal data.** Admin and moderator access must be least-privilege and
    audited via `AdminAuditLog`.
11. **Cross-user leakage.** Cache keys, socket rooms and export bundles must never mix users.

## Hard rules

- Never add a field, event or log line containing personal data without a stated purpose and
  retention.
- Never send user content to a new third party without explicit confirmation.
- Never bypass the consent gate for telemetry.
- Never widen admin visibility into personal data without auditing it.
- Never weaken the deletion or export paths; they are legal obligations, not features.
- Never log message plaintext, email bodies, or export contents.
- If a change may affect privacy or compliance, stop and warn before implementing (`AGENTS.md`).

## Output

- **Data inventory delta:** fields/tables added, classification, purpose.
- **Retention:** period and the mechanism enforcing it.
- **Export impact:** included or explicitly excluded with a reason.
- **Deletion impact:** cascade behaviour verified against `schema.prisma`.
- **Consent impact:** which gate applies.
- **Third parties** newly involved, if any.
- **Docs:** what to update in `06-security-privacy-compliance.md`.
