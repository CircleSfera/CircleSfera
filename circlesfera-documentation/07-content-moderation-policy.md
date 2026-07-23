# 07-Content-Moderation-Policy
## CircleSfera
**Version:** 3.0 aligned with the real project  
**Date:** April 2026  
**Source of truth:** product positioning + real capabilities of the current system

---

## 1. Purpose

This policy replaces the previous version to make it more realistic and aligned with the project. The main correction is that the policy must no longer depend on a data structure that does not formally exist in the schema today, such as `moderation_actions`, although it may still define principles, target timelines, and operational procedures.

> **Jul 2026 correction:** an earlier revision of this document said the policy could not depend on persisted `appeals` because that model didn't exist. It now does — see §11. What remains unmodeled is a dedicated `moderation_actions` table (§14).

CircleSfera maintains a moderation stance that is transparent, traceable, and oriented toward safety, legality, and ecosystem trust.

---

## 2. Principles

- Public and understandable rules.
- Consistent enforcement.
- Explainable decisions.
- Internal traceability.
- Prioritization of user safety.
- Do not use opaque visibility reductions as a normalized product mechanism.

---

## 3. Real moderation scope

CircleSfera must moderate, at minimum, these spaces currently consistent with the real system:

- Posts.
- Comments.
- Stories.
- Attached media.
- Profiles and usernames.
- Messages and shares in chat, according to internal policy and applicable legal obligations.

The previous version focused heavily on posts and accounts, but the real product already has stories and messaging, so the policy must expressly cover them.

---

## 4. Prohibited content

### Zero tolerance
- CSAM.
- Child sexual exploitation.
- Terrorism and terrorist recruitment.
- Human trafficking.
- Non-consensual intimate images.
- Extreme violence for glorification or instruction.
- Serious fraud, phishing, or operational financial abuse.

### Normally prohibited
- Impersonation.
- Severe targeted harassment.
- Credible threats.
- Punishable hate speech.
- Abusive spam.
- Sale or promotion of clearly illicit activities.
- Clear intellectual property violations after adequate review.

### Sexual and sensitive content
- **MATURE (Sensitive)**: Content that includes artistic nudity, strong language, or legal suggestive themes. This content must be classified under the `MATURE` rating and will only be visible to users who have explicitly enabled that preference.
- **GENERAL**: Content suitable for all audiences.
- **Strict Prohibition**: Given CircleSfera’s positioning, explicit sexual content, pornography, or exploitation is strictly prohibited, regardless of rating.

---

## 5. Sensitive or contextual content

May require restriction, notice, or additional review:

- Graphic violence in documentary, journalistic, or artistic context.
- Self-harm or suicide in a prevention or testimony context.
- Intense political topics.
- Conflictive but legal religious or ideological content.
- Non-sexualized artistic nudity, if the final policy decides to allow it in certain cases.

The decision here must not be reduced to “allowed/prohibited” without context. There must be criteria for context, risk, and potential harm.

---

## 6. Protected speech

CircleSfera must protect, within legality and its public rules:

- Political criticism.
- Satire and parody.
- Religious debate.
- Identity expression.
- Hard but not illegal social debate.

The platform must not confuse disagreement, incorrectness, or unpopularity with an automatic rules violation.

---

## 7. Signals and review sources

Decisions may originate from:

- User report.
- Automatic detection on text.
- Automatic detection on media.
- Account abuse or spam signals.
- Administrative or legal review.

---

## 8. Realistic operational process

### 8.1 Minimum flow
1. The content or account receives a signal.
2. A `Report` is created with a specific `targetType` (`USER`, `POST`, `COMMENT`, `STORY`, `MESSAGE`).
3. The initial status is `PENDING`.
4. An administrator changes the status to `REVIEWING` while evaluating.
5. The team makes a decision and marks the report as `RESOLVED` or `REJECTED`.
6. Traceability is recorded in `AdminAuditLog`.
7. The user is notified when the type of action requires it.

### 8.2 Formal Report Statuses
To ensure technical consistency, the system uses these closed statuses:
- **PENDING**: Report received, pending triage.
- **REVIEWING**: Under active review by a moderator.
- **RESOLVED**: Action taken and report closed.
- **REJECTED**: Report dismissed (no violation found).

### Standard Report Reasons (Enum)
To ensure traceability, reasons must be: `SPAM`, `HARASSMENT`, `ILLEGAL_CONTENT`, `VIOLENCE`, `HATE_SPEECH`, `IMPERSONATION`, `CSAM`, `OTHER`.

---

## 9. Possible measures

- No action.
- Labeling or notice.
- Temporary content restriction.
- Content removal.
- Limitation of account features.
- Temporary suspension.
- Account deactivation or ban in serious cases.
- Legal escalation when applicable.

Severity must be proportional to risk, recidivism, and potential harm.

---

## 10. Transparency and notification

When CircleSfera acts on content or an account, it should attempt to communicate clearly:

- What was done.
- Which part of the content or conduct caused the intervention.
- Which public rule is considered applicable.
- Whether or not there is a possibility of later review.

It is not advisable to always promise an “exact legal citation” in every product case, because many decisions will be based on platform rules and operational safety, not only strict criminal law.

---

## 11. Review or reconsideration

CircleSfera maintains a reconsideration process backed by a persisted `Appeal` model (`targetType`: `ACCOUNT_BAN` | `POST_REMOVAL`; `status`: `PENDING` | `APPROVED` | `REJECTED`; `adminNotes`). Users submit appeals via `POST /appeals` and track them under `Settings → Appeals` (`GET /appeals/my-appeals`); admins review and resolve via `GET /appeals/admin` / `PATCH /appeals/admin/:id`, and the outcome triggers a user notification. The SLA targets below remain operational targets, not schema guarantees — `Appeal` has no built-in SLA/deadline field.

### Recommended target SLA
- Presumably illegal or very serious content: high priority.
- Standard cases: review within a reasonable window.
- Reconsiderations: resolution target of 72 hours when viable.

---

## 12. Automated moderation

### Permitted use
- Preliminary classification and automatic assignment of `contentRating`.
- Review prioritization.
- Detection of evident patterns.
- Risk scoring on media.

### Not recommended as a sole rule
- Fully automatic definitive bans in non-evident cases.
- Complex contextual decisions without human review.

Automation must assist, not fully replace, human review in ambiguous cases.

---

## 13. Stories, chat, and ephemeral content

The previous policy did not fully integrate the reality of the current product.

### Stories
- Must be moderated even if they expire.
- Views and reactions do not replace content review.
- Highlights make a story persistent and may require reevaluation.

### Messaging
- Chat introduces a sensitive privacy area.
- Any review of messages must have a clear basis, internal controls, and proportionality.
- Sharing a post/story in chat must continue to respect availability and permissions of the source content.

### Live streaming
- Live streams (`LiveStream`, with optional co-host) are real-time and harder to review pre-publication; moderation here relies primarily on reports and host/co-host accountability.
- The gifting flow (`POST /live/:streamId/gift`) is a social interaction, not a payment — it does not move money, so it carries no billing-fraud risk today, but abusive or misleading gift-related messaging is still in scope for moderation.

---

## 14. Internal logging and accountability

Although the current schema does not model a formal `ModerationAction` entity, CircleSfera maintains operational traceability using `Report`, `AdminAuditLog`, `Appeal`, and complementary internal records. The policy must not depend on specific technical nomenclature, but on the real ability to explain and audit decisions.

---

## 15. Closed decisions

- The official policy now covers posts, comments, stories, profiles, and chat.
- Explicit sexual content is out of platform as a general rule.
- Reconsiderations are backed by a persisted `Appeal` entity (§11) with an operational SLA on top; there is still no dedicated `ModerationAction` table (§14).
- Automated moderation is used as support, not as a blind replacement for human judgment.
- The public policy must be compatible with the product’s operational reality and with specific legal advice when DSA, GDPR, or applicable criminal law is involved.
