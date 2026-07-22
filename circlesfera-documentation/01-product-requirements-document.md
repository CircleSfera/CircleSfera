# 01 — Product Requirements Document
## CircleSfera
**Version:** 4.0 — philosophy + schema-aligned product scope  
**Date:** July 2026  
**Functional and data source of truth:** current project `schema.prisma` and implemented Nest/React code  

> Prefer `schema.prisma` and implemented controllers when this document and older Abr 2026 snapshots disagree. See [00-status.md](./00-status.md).

---

## 1. Philosophy and fundamental principles

CircleSfera is built on the premise that a modern social network must not merely distribute content; it must provide a social experience grounded in **user control**, **operational transparency**, and **trust**. These principles are structural product decisions. They must guide platform evolution, feature design, internal policies, and technical implementation across systems.

### 1.1 User control comes first

The user is the primary decision agent on the platform. CircleSfera must provide mechanisms to configure and personalize the social experience in an explicit, predictable, and understandable way.

This implies that, as far as reasonably possible, the user should be able to determine:

- What content they want to consume.
- Whom they follow and who may interact with them.
- What kind of recommendations they receive.
- What information they share and with whom.
- How privacy, notifications, and content preferences are managed.

Platform decisions must not unnecessarily replace user decisions. Automated systems should **complement** the social experience, not impose it.

### 1.2 Algorithmic transparency

Recommendation, ranking, and discovery systems are essential to CircleSfera and must operate in a comprehensible, explainable way.

The platform should aim for users to reasonably understand:

- Why they are seeing a given piece of content.
- Why certain profiles are recommended.
- Which signals influenced the recommendations they received.
- Which of their own actions can change future experience.

Recommendations may use multiple signals (social relationships, interests, recent activity, prior interactions, topical affinity, content popularity). Those signals must not become opaque or arbitrary processes.

Algorithmic transparency is both a trust mechanism and a product differentiator.

### 1.3 No hidden suppression

CircleSfera does not adopt internal policies of hidden or arbitrary visibility reduction for users or content. The platform does not use shadow banning as an ordinary ecosystem management tool.

Content visibility must follow explicit, verifiable criteria such as:

- The consuming user’s own preferences.
- Post privacy settings.
- Existing social relationships.
- The declared behavior of discovery systems.
- Legal or safety obligations that are duly justified.

When content or an account is limited, restrictions must rest on objective, communicable, and traceable grounds. User trust requires that decisions affecting distribution are not kept hidden.

### 1.4 Strict and explicit moderation

Moderation protects the social ecosystem and must operate under transparency, consistency, and traceability.

Whenever reasonably possible, the platform should inform the user:

- What action was applied.
- Why it was applied.
- Which rule, policy, or legal requirement motivated it.
- What options exist to request review or provide additional information.

Moderation actions must be internally auditable and aligned with public platform policies. Trust increases when moderation decisions are understandable and justifiable, not arbitrary or opaque.

### 1.5 Responsible data handling

CircleSfera processes information needed to operate, protect, personalize, improve, and monetize the service in a responsible and transparent manner.

Users retain the rights that apply to their content and personal data.

The platform may collect and process data proportionally to legitimate purposes, including service operation, storage, security, recommendation, discovery, analytics, support, legal compliance, and commercial uses compatible with applicable law.

Processing must follow purpose limitation, proportionality, transparency, security, data minimization, and storage limitation. CircleSfera must not collect more information than needed for each concrete purpose, nor retain it longer than required for that purpose. Where data has a commercial use, that use must be clearly defined, legally valid, and respect applicable licenses, consents, and preferences.

Uses of data that significantly affect user experience must pursue legitimate aims, remain reasonably explainable, and balance personalization, monetization, transparency, and user rights.

The platform must be able to justify **what** data it collects, **why**, **for how long**, and **under what basis or authorization**.

### 1.6 Guiding principle

Every product, architecture, moderation, recommendation, or data-processing decision in CircleSfera must clearly answer three questions:

1. Is the user reasonably in control of this experience?
2. Can we explain why the system made this decision?
3. Is the action transparent, traceable, and consistent with the platform’s declared policies?

If a feature cannot satisfactorily answer these questions, its design must be revised before it ships.

---

## 2. Summary

CircleSfera is a multi-format social network focused on social content, identity, messaging, platform monetization, operational transparency, and progressive evolution toward richer experiences than a posts-only network. According to the current schema, the product already covers posts, stories, frames, chat, bookmarks, collections, highlights, follows, blocks, mutes, notifications, promotions, platform subscriptions, creator subscriptions, reporting, appeals, auditing, audio, search, live, interactive polls/QnA, and embedding capabilities for ranking or discovery.

Documentation must reflect that reality: CircleSfera is no longer a minimal MVP of posts + likes + follows, but a social platform with multiple modeled subsystems. The documentary roadmap must distinguish:

- **Capabilities implemented in the data model**
- **Capabilities activated in product/UI**
- **Capabilities prepared for evolution**

---

## 3. Product vision

CircleSfera aims to compete with Instagram and TikTok through a clearer proposition for users and creators: controlled identity, explicit social relationships, mixed content experiences, first-party monetization, and a more auditable trust operation.

Differentiation does not depend only on the feed, but on combining:

- Post publishing and short formats.
- Ephemeral stories and persistent highlights.
- Private messaging and content sharing in chat.
- Monetization via platform plans (and modeled creator subscriptions).
- Modern security and authentication, including passkeys.
- Traceable moderation, reporting, and appeals.
- Infrastructure prepared for advanced discovery with embeddings.

---

## 4. Real product scope

### 4.1 Capabilities modeled in the project

According to the current `schema.prisma`, the product includes these functional areas:

- User accounts with status, roles, verification, and account type.
- Profile decoupled from credentials.
- Authentication with refresh tokens, reset tokens, verification tokens, and passkeys.
- Posts with multi-media, hashtags, user tags, visibility, audio, and type `POST` or `FRAME`.
- Stories with expiry, close friends, audio, views, reactions, and highlights.
- Separate like entities for posts and comments.
- Nested comments.
- Bookmarks and collections.
- Follows, blocks, and mutes.
- Inter-user notifications.
- Conversations, participants, messages, replies, and reactions.
- Sharing posts and stories in chat.
- Platform subscriptions and plans; creator subscriptions.
- Billing webhooks and ledger/transaction models where present.
- Promotions / boosts.
- Search history.
- Content reports and appeals.
- Admin audit logs.
- Reusable audio.
- Post embeddings (and profile embeddings for semantic search) with pgvector.
- Live streams and interactive polls / QnA boxes.
- Early-access whitelist.
- User settings (privacy / notification-oriented configuration).

### 4.2 Capabilities not supported by the current schema

Do **not** present the following as current product reality unless/until they exist in `schema.prisma`:

- Communities or groups as first-class social spaces.
- Brand–creator marketplace.
- Persisted feed-preference profiles as dedicated tables.
- Entitlements as a separate persisted entity (beyond what subscriptions/transactions already cover).
- Fully separate “moderation_actions” case-management tables beyond reports, appeals, and admin audit logs.

> **Schema correction vs older drafts:** `Mute`, `Appeal`, `CreatorSubscription`, and `Transaction` **are** present in the current schema and must be documented as modeled capabilities (see §4.1), even when UI/activation is gradual.

---

## 5. Product objectives

### 5.1 Primary objectives

- Build a complete social experience around identity, content, and messaging.
- Support Instagram-like visual publishing, including stories, collections, and highlights.
- Enable evolution toward recommendations and discovery with embeddings.
- Keep a foundation suitable for first-party monetization with Stripe.
- Sustain moderation, auditing, and security capabilities that make the product credible.

### 5.2 Secondary objectives

- Facilitate future ranking, semantic search, and personalization layers.
- Enable growth loops via chat sharing, follows, stories, and promotions.
- Prepare the platform for strong identity with passkeys and verification levels.

---

## 6. Users and roles

### 6.1 Standard user

Publishes posts or stories, follows accounts, comments, likes, saves content, chats, and consumes media.

### 6.2 Creator

Publishes more frequently; uses frames, promotions, audio, tags, collections; seeks growth and monetization within the platform.

### 6.3 Verified or business account

Uses verification levels and platform subscriptions for greater trust, commercial positioning, or premium capabilities.

### 6.4 Administrator

Operates reporting, auditing, and administrative actions. The schema includes `Role.ADMIN` and `AdminAuditLog`.

---

## 7. Functional modules

### 7.1 Identity and access

- Registration and login.
- Refresh tokens.
- Email verification.
- Account recovery.
- Passkeys / WebAuthn.
- Account states: active, soft-deleted (`deletedAt`).
- Roles: `USER`, `ADMIN`.
- Verification levels: `BASIC`, `VERIFIED`, `BUSINESS`, `ELITE`.
- Account types: `PERSONAL`, `CREATOR`, `BUSINESS`.

### 7.2 Social profile

- Unique username on `Profile`.
- Public name, bio, website, and location.
- Avatar with optimized variants.
- Private profile via `UserSettings.privacyLevel` (exposed to clients as `isPrivate` where mapped).

### 7.3 Content

- Posts with caption, multi-media, hashtags, and tags.
- Stories with expiry.
- Frames via `Post.type = FRAME`.
- Optional audio on posts and stories.
- Visibility `PUBLIC`, `FOLLOWERS`, `PRIVATE`.
- Per-post view counters.

### 7.4 Interaction

- Post likes.
- Comment likes.
- Nested comments.
- Bookmarks and collections.
- Story views and reactions.
- Sharing posts and stories in chat.
- Polls and QnA (interactive module).

### 7.5 Social relationships

- Follows with `PENDING` or `ACCEPTED`.
- Blocks.
- Mutes.
- Close friends for restricted stories.
- Tagged users on posts.

### 7.6 Messaging

- Conversations and participants.
- Messages with reply.
- Shared post/story in a message.
- Message reactions.
- `lastReadAt` per participant.

### 7.7 Monetization

- Platform plans.
- Platform subscriptions.
- Creator subscriptions (modeled).
- Stripe customer ID on the user.
- Webhook event log for idempotency.
- Promotions for boosts.
- Transactions / ledger where modeled.

#### Design decision: one active platform plan per user

CircleSfera adopts **one active platform plan per user at a time**. A user must not hold two simultaneous **active** subscriptions to different platform plans. This rule is enforced in application logic before creating a new subscription.

**Consequences:**

- When subscribing to a new plan, if a prior active subscription exists, the system must cancel the previous one (at period end, as applicable) before activating the new one.
- Schema `UNIQUE(userId, planId)` prevents duplicates of the **same** plan, but not two different plans at once; active-plan uniqueness is enforced in code.
- Product contract: at most one active platform subscription; billing UI/API should expose a single active subscription view (not an array of concurrent actives).

**Valid `platform_subscriptions.status` values** (`SubscriptionStatus` in Prisma):

| Status | Description |
| --- | --- |
| `ACTIVE` | Subscription current and in good standing |
| `TRIALING` | Free trial period |
| `PAST_DUE` | Payment failed; Stripe will retry |
| `INCOMPLETE` | Checkout started but not completed |
| `CANCELLED` | Cancelled; access may continue until period end |
| `EXPIRED` | Period ended without renewal |

### 7.8 Trust, security, and operations

- Reports and appeals.
- Admin audit log.
- Email verification and reset tokens.
- Passkeys.
- User settings (GDPR-oriented privacy, content, and notification preferences).
- Soft delete via `deletedAt`.
- Activity status: online / last seen.
- Live streaming controls where modeled.

### 7.9 Search and discovery

- Hashtags.
- Search history.
- Post embeddings with `pgvector`.
- Profile embeddings for semantic profile search (read path; writer/backfill still evolving — see [ADR-0001](./adr/0001-profile-embedding-retention.md)).

---

## 8. Revised phase scope

Older documentation treated stories and frames as “phase 2.” That no longer matches the product model. The correct framing is:

### Current project phase (modeled)

- Posts: yes.
- Stories: yes.
- Frames: yes, as a `Post` variant.
- Chat: yes.
- Bookmarks and collections: yes.
- Highlights: yes.
- Platform subscriptions: yes.
- Creator subscriptions: yes (modeled).
- Promotions: yes.
- Passkeys: yes.
- Mutes, appeals, live, interactive: yes (modeled).
- Embeddings: yes as a technical capability.

### Activatable / not necessarily fully exposed in UI

- Semantic discovery based on embeddings (including profile embedding backfill).
- Advanced promotion management.
- Richer admin workflows over reports and appeals.
- Richer premium layers on platform plans.
- Full creator-subscription product surface.

### Future / not yet modeled as first-class product domains

- Communities.
- Brand–creator marketplace.
- Complex creator payouts.
- Dedicated feed-preference tables.
- Deeper moderation case management beyond reports + appeals + audit logs.

---

## 9. Revised product principles

1. Documentation must follow the real system, not an outdated conceptual simplification.
2. What is implemented in the schema is a product capability, even if UI exposure is gradual.
3. Trust features must be explained without claiming models that do not exist in the database.
4. Monetization decisions must consider fraud, support, webhooks, and idempotency.
5. Content decisions must consider growth, retention, creators, chat, and discovery.
6. Every major feature must pass the three guiding questions in §1.6.

---

## 10. Current risks

- Prior documentation underestimates real product scope.
- Risk of misalignment between active UI and capabilities persisted in the database.
- The model includes advanced features that need clear prioritization to avoid operational complexity without return.
- Promotions and billing need anti-fraud controls, reconciliation, and support.
- Appeals and mutes exist in schema; product/UX completeness may still lag.
- Profile embedding search can return empty until writers/backfill ship (ADR-0001).

---

## 11. Closed documentary decisions

- The current schema is the primary source of product reality.
- Stories, frames, chat, highlights, bookmarks, collections, passkeys, platform subscriptions, creator subscriptions, promotions, mutes, appeals, live, and interactive features belong in official documentation as modeled capabilities.
- Official PRD content must not present absent entities as if they were already part of the live system.
- Future capabilities are documented as roadmap, not as implemented reality.
- Philosophy in §1 is binding for product and engineering decisions.

---
