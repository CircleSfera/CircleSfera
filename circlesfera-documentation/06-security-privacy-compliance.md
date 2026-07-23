# 06-Security-Privacy-Compliance
## CircleSfera
**Version:** 3.0 aligned with the real project  
**Date:** April 2026  
**Source of truth:** documented real product + current technical stack + current schema

---

## 1. Purpose

This document replaces the previous security, privacy, and compliance version to align it with CircleSfera's real system. The main correction is twofold:

1. It must reflect the real capabilities of the current model, including passkeys, refresh tokens, reports, admin audit logs, stories, chat, promotions, mutes, appeals, live streaming, and billing with Stripe.
2. It must not promise persisted mechanisms that the current schema does not explicitly model, such as `moderation_actions`, `feed_preferences`, or detailed persisted analytics.

> **Jul 2026 correction:** an earlier revision of this document listed `mutes` and `appeals` alongside unmodeled mechanisms. Both are real, persisted models (`Mute`, `Appeal`) with shipped endpoints — see §10.1. What genuinely remains unmodeled is a dedicated `moderation_actions` table and persisted `feed_preferences`.

---

## 2. Principles

- Security by design.
- Privacy by design.
- Least privilege.
- Defense in depth.
- Auditability of sensitive actions.
- Minimum necessary data.
- Pragmatic and documented compliance.

---

## 3. Real surface to protect

CircleSfera is not just auth + posts. The real surface includes:

- User accounts and profiles.
- Refresh tokens.
- Passkeys.
- Media uploads for posts, stories, avatar, and messages.
- Conversations and messages.
- Billing metadata with Stripe.
- Webhook events.
- Reports.
- Admin audit logs.
- Search history.
- Basic presence (`isOnline`, `lastSeenAt`).
- Promotions.
- Post embeddings and profile embeddings.
- Mutes and appeals.
- Live streams (with co-hosts and gifting).
- Creator subscriptions (Stripe Connect).

This means security and privacy risks are greater than in a reduced documentary MVP.

---

## 4. Authentication and authorization

### 4.1 Supported authentication
- Password + JWT access token.
- Persisted refresh tokens.
- Email verification flows.
- Password reset.
- Passkeys/WebAuthn.

### 4.2 Recommended rules
- Short-lived access tokens.
- Revocable and rotatable refresh tokens.
- Strong password hashing.
- Session revocation on sensitive events.
- MFA via passkeys as a priority evolution over SMS.

### 4.3 Authorization

The current schema only shows `Role` at the user level and does not model complex per-table RBAC. The official policy must state that:

- There is at least a `USER` and `ADMIN` role.
- Any additional permission by plan or verification must be resolved in the application, not assumed as complete persisted RBAC.
- Fine-grained permission systems must not be documented as if they already exist in persistence if they are not actually implemented.

---

## 5. Data protection

### 5.1 Especially sensitive or delicate data
- Email.
- Password hash.
- Refresh tokens.
- Verification/reset tokens.
- Stripe customer/subscription metadata.
- Private messages.
- Reports.
- Audit logs.
- Search history.
- Presence data.

### 5.2 Minimum measures
- Encryption in transit with TLS.
- Encryption at rest for database and object storage.
- Centralized secret management.
- Logging without exposing unnecessary PII.
- Restricted access to reports, audit, and billing tables.

### 5.3 Data that must not be promised as field-level encrypted without real implementation
The previous version listed specific encryption on certain sensitive fields, but that must be documented accurately. If there is no real application-level or column-level encryption implementation, it should say “protected by encryption at rest and access controls,” not “field-level encryption” as an established fact.

---

## 6. Privacy and GDPR

### 6.1 Applicable principles
- Minimization.
- Purpose limitation.
- Storage limitation.
- Transparency.
- User control where viable.
- **Privacy by Default**: Private profiles require explicit approval of follow requests (`PENDING` -> `ACCEPTED`).

### 6.2 User rights
CircleSfera must be able to operationally support:

- Access to personal data.
- Rectification of profile and account.
- Deletion or soft-delete with a subsequent purge process.
- Reasonable data portability.
- Objection to optional processing.

### 6.3 What must be corrected relative to prior documentation
- Do not assert concrete export endpoints or a GDPR dashboard as if they already exist if they are not actually defined in the current API.
- Do not assert a “designated DPO” or formal audits if they do not yet truly exist.
- Do not assert “persisted consent preferences” if there is no specific storage and management model.

### 6.4 Data retention

> ⚠️ This section has legal and tax implications. It must be reviewed with specialized counsel before being published as a final policy. The timelines here are initial operational recommendations.

| Data type                       | Recommended retention                                            | Mechanism                                    |
|---------------------------------|------------------------------------------------------------------|----------------------------------------------|
| Active account                  | While a legitimate basis for processing exists                  | None — indefinite retention while active      |
| Deleted account (soft delete)   | **30-day grace period** before full physical deletion            | Soft delete via `deletedAt`; automatic purge at 30 days |
| Refresh tokens                  | Until expiration or explicit revocation                         | TTL in database                               |
| Verification / reset tokens     | Until use or expiration (max. 24h–72h)                          | TTL in database                               |
| Private messages                | **Configurable retention per message (`expiresAt`)**            | **Automatic purge after expiration**          |
| Search history                  | Maximum 90 days from creation; automatic purge                  | Periodic job on `expiresAt` field             |
| Reports                         | 2 years from `resolvedAt` or `createdAt` if unresolved          | Long retention for security obligations       |
| Admin audit logs                | Minimum 3 years                                                  | No automatic purge; archive after year 1      |
| Operational logs (request/error)| 30–90 days depending on sensitivity level                       | Log rotation policy                           |
| Billing records                 | Per applicable legal obligation (minimum 5 years in ES/EU)      | No purge; cold archive after year 1           |
| Webhook events (payload)        | See section 9.4                                                  | See section 9.4                               |
| Post embeddings                 | While the post exists                                            | Cascade delete with post                      |
| Presence (`isOnline`, `lastSeenAt`) | Current value only; no persisted history                   | Direct overwrite                              |

---

## 7. Media security

### 7.1 Risks
- Malware in files.
- Illegal or sensitive content.
- Accidental public exposure.
- URL enumeration.
- Unauthorized reuse of private media.

### 7.2 Controls
- Real MIME validation.
- Size and duration limits.
- Antivirus scanning.
- Automated moderation pipeline.
- Image/video variants processed in the backend.
- Private buckets and controlled delivery where applicable.
- **Content Rating System**: Content classification as `GENERAL` and `MATURE` to filter sensitive content according to user preference.

### 7.3 Especially sensitive areas
- Stories.
- Messages with media.
- Avatars and profile uploads.
- Content sharing via chat.

---

## 8. Chat and private content

The current product already includes messaging. That significantly changes the security and privacy framework.

### Minimum rules
- Messages must be treated as private data.
- Access must be limited to participants and authorized staff under clear policies.
- Messaging attachments must pass security controls equivalent to those for other media.
- There must be an internal policy for message access for support, abuse, or legal requirements.

If proactive DM moderation is decided in the future, that must be documented carefully due to legal and reputational impact.

### Profile Privacy
- **Public Profile**: All content is visible to any user (or guest). Followers are accepted automatically.
- **Private Profile**: Only followers with `ACCEPTED` status can see posts and stories. New requests remain in `PENDING` status until the user approves or rejects them.

---

## 9. Billing and fraud

### 9.1 Real model
CircleSfera uses Stripe and persists `PlatformPlan`, `PlatformSubscription`, and `WebhookEvent`.

### 9.2 Key controls
- Webhook signature verification (`Stripe-Signature` header).
- Idempotency via unique `externalId` in `webhook_events`.
- Periodic reconciliation of states between Stripe and the database.
- Clear separation between checkout success and definitive activation after a processed webhook.
- Alerts on webhooks in `failed` status or unprocessed after a time window.

### 9.3 Operational risks
- Subscription active in Stripe but not reflected in the DB (lost or failed webhook).
- Duplicate webhooks processed twice (mitigated by idempotency on `externalId`).
- Delayed webhooks that arrive out of order relative to user actions.
- Complex support for cancellations, refunds, and disputed charges.

### 9.4 Retention and security of `webhook_events`

Stripe events persist the full payload, which may contain payment metadata, subscription IDs, and sensitive financial information.

**Retention policy for `webhook_events`**

| Field          | Action after processing                                                       |
|----------------|-------------------------------------------------------------------------------|
| `payload`      | Purge content **30 days** after `processedAt`; keep only `externalId`, `status`, `processedAt` |
| `provider`     | Retain indefinitely                                                           |
| `externalId`   | Retain indefinitely (needed for future idempotency)                           |
| `status`       | Retain indefinitely                                                           |
| `createdAt`    | Retain indefinitely                                                           |
| `processedAt`  | Retain indefinitely                                                           |

**Additional controls on `webhook_events`**
- The payload must not be logged in full to any external observability system.
- Access to the `webhook_events` table must be restricted to the ADMIN role and the billing service.
- If the payload is retained beyond 30 days, it must be operationally justified and documented as an explicit decision.
- Consider obfuscating or excluding especially sensitive fields from the payload before persisting (e.g., last 4 digits of a card, customer data in Stripe events that include it).

> ⚠️ The exact billing data retention policy has legal and tax implications. Review with counsel before setting it as a public policy. In Spain, VAT law and commercial regulations may require keeping billing records for 4–10 years, but that does not necessarily imply retaining the full Stripe JSON payload.

---

## 10. Moderation and reporting

### 10.1 Current model reality
The current schema supports `Report`, `AdminAuditLog`, and `Appeal` (`targetType`: `ACCOUNT_BAN` | `POST_REMOVAL`; `status`: `PENDING` | `APPROVED` | `REJECTED`), exposed at `POST /appeals`, `GET /appeals/my-appeals`, `GET /appeals/admin`, `PATCH /appeals/admin/:id`, and surfaced in-app under `Settings → Appeals`. There is still no separate `ModerationAction` model — `Report` + `AdminAuditLog` remain the general moderation-trace surface.

### 10.2 Documentary implication
- The public policy may discuss review, notification, and reconsideration, and may now reference a real, persisted appeals flow.
- The internal policy must not present a `ModerationAction`-style structured action log as if it already exists in data if it is not yet modeled — appeal outcomes and content actions are still traced via `Appeal.status`/`adminNotes` and `AdminAuditLog`, not a dedicated action table.

### 10.3 Anti-shadowbanning
If CircleSfera wants to defend a transparency stance, any artificial reduction of visibility should be exceptional, documented, and traceable. That promise has legal and reputational implications and must be stated precisely, not as an absolute slogan that is impossible to fulfill operationally.

---

## 11. Logs and auditing

### 11.1 Operational logs
- Request logs.
- Error logs.
- Security event logs.
- Billing logs.

### 11.2 Real auditability

`AdminAuditLog` is the foundation of administrative traceability. It must be used mandatorily for:

- Account status changes (suspension, deactivation, ban).
- Actions on reports (resolution, rejection, escalation).
- Interventions on content (deletion, restriction, labeling).
- Manual support decisions on subscriptions or payments.
- Administrative modifications to profiles or other sensitive resources.

### 11.3 Mandatory vocabulary for `AdminAuditLog`

To ensure real and auditable traceability, values of the `action` and `targetType` fields must follow this closed contract. Values outside this vocabulary must not be recorded in production without review.

**Valid values for `action`**

| Value                      | Description                                                  |
|----------------------------|--------------------------------------------------------------|
| `BAN_USER`                 | Permanently deactivates the account                          |
| `UNBAN_USER`               | Reactivates a previously banned account                      |
| `DELETE_USER`              | Physical deletion or definitive soft-delete of a user        |
| `UPDATE_USER_STATUS`       | Manual status change (verified, account type, etc.)          |
| `DELETE_POST`              | Physical deletion of a post for moderation                   |
| `DELETE_COMMENT`           | Deletion of a comment for moderation                         |
| `DELETE_STORY`             | Deletion of a story for moderation                           |
| `CONTENT_REMOVED`          | Generic: content removed after a report                      |
| `CONTENT_RESTRICTED`       | Content hidden or with reduced visibility                    |
| `CONTENT_LABELED`          | Labeled with a sensitive content warning                     |
| `REPORT_REVIEWED`          | Report marked as seen by an admin                            |
| `REPORT_RESOLVED`          | Report closed with an action taken                           |
| `REPORT_DISMISSED`         | Report closed with no action (false positive)                |
| `REPORT_ESCALATED`         | Escalated to a higher moderation level                       |
| `UPDATE_WHITELIST`         | Manual modification of a whitelist entry                     |
| `DELETE_WHITELIST`         | Deletion of a whitelist entry                                |
| `ACCOUNT_WARNED`           | Formal warning sent to the user                              |
| `ACCOUNT_SUSPENDED`        | Temporary suspension of functions                            |
| `ACCOUNT_RESTORED`         | Restoration of privileges after a sanction                   |
| `SUBSCRIPTION_ADJUSTED`    | Manual adjustment of plan or subscription dates              |
| `SUBSCRIPTION_CANCELLED`   | Administrative cancellation of a subscription                |
| `PROMOTION_REJECTED`       | Rejection of a promotion request                             |
| `CREATE_AUDIO`             | Creation of an official audio track                          |
| `UPDATE_AUDIO`             | Editing of audio metadata                                    |
| `DELETE_AUDIO`             | Removal of audio from the public catalog                     |
| `MANUAL_OVERRIDE`          | Emergency or uncategorized action                            |

**Valid values for `targetType`**

| Value          | Description                          |
|----------------|--------------------------------------|
| `user`         | Action on a user account             |
| `post`         | Action on a post or frame            |
| `comment`      | Action on a comment                  |
| `story`        | Action on a story                    |
| `message`      | Action on a message                  |
| `report`       | Action on a report                   |
| `subscription` | Action on a subscription             |
| `promotion`    | Action on a promotion                |

### 11.4 Rule
Do not log secrets or unnecessary payloads. Especially avoid: tokens, passwords, credentials, full private contents, or excessive PII in the `details` field.

---

## 12. Applicable compliance

### 12.1 GDPR / LOPDGDD
Clearly applies due to processing of personal data of EU users.

### 12.2 DSA
If CircleSfera operates as an online platform with user content in the EU, moderation transparency, reports, and complaint mechanisms will be relevant. Documentation must be prudent: product aspiration is one thing; complete formal compliance is another.

### 12.3 ePrivacy / cookies
Granular cookie and consent management must only be promised if the real implementation exists.

### 12.4 PCI DSS
Stripe reduces scope, but does not eliminate security obligations around webhooks, access control, and subscription metadata.

---

## 13. Testing and validation

### Minimum requirements
- SAST and dependency scanning in CI.
- Container scanning if Docker is used.
- Auth and authorization tests.
- Webhook tests.
- Secure upload tests.
- Periodic dependency review.
- Pentest or external review when the product and traffic justify it.

---

## 14. Closed decisions

- Passkeys are incorporated into the official security document.
- Chat is incorporated as an explicit privacy and security surface.
- Real billing with webhooks is incorporated as a critical flow.
- `Mute` and `Appeal` are recognized as real, persisted mechanisms (§10.1) and removed from the "does not exist" list.
- Any closed assertion about `moderation_actions`, `feed_preferences`, and unimplemented GDPR dashboards is removed from the official document as current technical reality.
- Every public promise of transparency or compliance must be operationally sustainable.
