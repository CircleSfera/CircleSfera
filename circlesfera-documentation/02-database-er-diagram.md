# 02-Database-ER-Diagram
## CircleSfera
**Version:** 3.1 aligned with the real schema (User/Profile split, Aug 2026)  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Source of truth:** current project `schema.prisma`

---

## 1. Modeling criteria

This ERD describes the reality of the project's current model. It does not simplify toward an outdated MVP, nor does it add entities that do not exist in the shared `schema.prisma`.

**Identity model (Aug 2026):** platform **`User`** = account/money/auth; **`Profile`** = social identity (`username`, content FKs); **`AdminIdentity`** = admin panel operators. See [15-identity-profile-model.md](./15-identity-profile-model.md) and [ADR-0015](./adr/0015-user-profile-identity-split.md).

---

## 2. Identity entities

### users
- `id` (PK)
- `email` (UNIQUE)
- `password`
- `createdAt`
- `updatedAt`
- `isActive`
- `deletedAt`
- `isOnline`
- `lastSeenAt`
- `stripeCustomerId` (UNIQUE, nullable)
- `role`
- `emailVerified`
- `verificationToken` (UNIQUE, nullable)
- `resetToken` (UNIQUE, nullable)
- `resetTokenExpires`
- `verificationLevel`
- `accountType`
- `currentChallenge`

### profiles
- `id` (PK)
- `userId` (FK → users.id; indexed, not unique — account may own multiple profiles)
- `username` (UNIQUE)
- `fullName`
- `bio`
- `avatar`
- `standardUrl`
- `thumbnailUrl`
- `website`
- `location`
- `createdAt`
- `updatedAt`
- `cover`
- `coverStandardUrl`
- `coverThumbnailUrl`
- `isAccountBanned`
- `accountBanReason`
- `suspendedUntil`

### refresh_tokens
- `id` (PK)
- `token` (UNIQUE)
- `userId` (FK → users.id)
- `expiresAt`
- `createdAt`

### passkeys
- `id` (PK)
- `userId` (FK → users.id)
- `credentialID` (UNIQUE)
- `publicKey`
- `counter`
- `transports`
- `createdAt`

### admin_identities
- `id` (PK)
- `email` (UNIQUE)
- `passwordHash`
- `displayName`
- `status` (`AdminIdentityStatus`)
- `totpSecret`, `totpEnabled`, `mfaRequired`
- `linkedUserId` (nullable FK → users.id — correlation only)
- `lastLoginAt`, `lastActivityAt`, `failedLoginCount`, `lockedUntil`
- `createdAt`, `updatedAt`
- Separate from platform `User`; authorizes `/api/v1/admin/*` ([ADR-0013](./adr/0013-admin-panel-admin-identity.md)).

### admin_roles / admin_permissions / join tables
- RBAC for Admin Panel (`AdminRole`, `AdminPermission`, `AdminIdentityRole`, `AdminRolePermission`).

### user_settings
- `id` (PK)
- `userId` (UNIQUE, FK → users.id)
- `privacyLevel`, `contentPreference`, `blurSensitiveContent`
- `emailNotifications`, `pushNotifications`, `isOnboarded`
- `updatedAt`

---

## 3. Primary content

### posts
- `id` (PK)
- `profileId` (FK → profiles.id)
- `caption`
- `createdAt`
- `updatedAt`
- `location`
- `hideLikes`
- `turnOffComments`
- `type` (`POST | FRAME`)
- `contentRating` (`GENERAL | MATURE`)
- `views`
- `visibility` (`PUBLIC | FOLLOWERS | PRIVATE`)
- `priceCents`
- `audioId` (nullable FK → audio_tracks.id)

### post_media
- `id` (PK)
- `postId` (FK → posts.id)
- `url`
- `standardUrl`
- `thumbnailUrl`
- `type`
- `order`
- `filter`
- `altText`
- `createdAt`

### post_tags
- `postId` (FK → posts.id)
- `profileId` (FK → profiles.id)
- `x`
- `y`
- `createdAt`
- UNIQUE (`postId`, `profileId`)

### hashtags
- `id` (PK)
- `tag` (UNIQUE)
- `postCount`
- `createdAt`

### post_hashtags
- `postId` (FK → posts.id)
- `hashtagId` (FK → hashtags.id)
- `createdAt`
- Composite PK (`postId`, `hashtagId`)

### post_embeddings
- `postId` (PK, FK → posts.id)
- `vector` (`vector(1536)` via pgvector)

### profile_embeddings
- `profileId` (PK, FK → profiles.id)
- `vector` (`vector(1536)` via pgvector)
- Read path: `SearchService.semanticSearchProfiles` (`GET /search/ai/profiles`). Write path: `ProfilesService` enqueues `generate-profile-embedding` on profile update (`username`/`fullName`/`bio` change); backfill via `npm run embeddings:backfill`. See [ADR-0001](./adr/0001-profile-embedding-retention.md).

### audio_tracks
- `id` (PK)
- `title`
- `artist`
- `url`
- `thumbnailUrl`
- `duration`
- `createdAt`
- `updatedAt`

---

## 4. Stories and derivatives

### stories
- `id` (PK)
- `profileId` (FK → profiles.id)
- `mediaUrl`
- `standardUrl`
- `thumbnailUrl`
- `mediaType`
- `expiresAt`
- `createdAt`
- `isCloseFriendsOnly`
- `audioId` (nullable FK → audio_tracks.id)

### story_views
- `id` (PK)
- `storyId` (FK → stories.id)
- `viewerId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`storyId`, `viewerId`)

### story_reactions
- `id` (PK)
- `storyId` (FK → stories.id)
- `profileId` (FK → profiles.id)
- `reaction`
- `createdAt`
- UNIQUE (`storyId`, `profileId`)

### highlights
- `id` (PK)
- `profileId` (FK → profiles.id)
- `title`
- `coverUrl`
- `createdAt`
- `updatedAt`

### highlight_stories
- `id` (PK)
- `highlightId` (FK → highlights.id)
- `storyId` (FK → stories.id)
- `createdAt`
- UNIQUE (`highlightId`, `storyId`)

### close_friends
- `id` (PK)
- `profileId` (FK → profiles.id)
- `friendId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`profileId`, `friendId`)

---

## 5. Interactions

### comments
- `id` (PK)
- `postId` (FK → posts.id)
- `profileId` (FK → profiles.id)
- `content`
- `mediaUrl`
- `mediaType`
- `createdAt`
- `updatedAt`
- `parentId` (nullable FK → comments.id)

### likes
- `id` (PK)
- `postId` (FK → posts.id)
- `profileId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`postId`, `profileId`)

### comment_likes
- `id` (PK)
- `commentId` (FK → comments.id)
- `profileId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`commentId`, `profileId`)

### bookmarks
- `id` (PK)
- `profileId` (FK → profiles.id)
- `postId` (FK → posts.id)
- `collectionId` (nullable FK → collections.id)
- `createdAt`
- UNIQUE (`profileId`, `postId`)

### collections
- `id` (PK)
- `profileId` (FK → profiles.id)
- `name`
- `coverUrl`
- `standardUrl`
- `thumbnailUrl`
- `createdAt`
- `updatedAt`

---

## 6. Social graph

### follows
- `id` (PK)
- `followerId` (FK → profiles.id)
- `followingId` (FK → profiles.id)
- `status` (`PENDING | ACCEPTED`)
- `createdAt`
- UNIQUE (`followerId`, `followingId`)

### blocks
- `id` (PK)
- `blockerId` (FK → profiles.id)
- `blockedId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`blockerId`, `blockedId`)

### mutes
- `id` (PK)
- `muterId` (FK → profiles.id)
- `mutedId` (FK → profiles.id)
- `createdAt`
- UNIQUE (`muterId`, `mutedId`)
- Excludes the muted user's posts from `FeedService` queries (`foryou` and `following`); exposed via `POST/DELETE /users/:username/follow/mute` and `GET /users/me/follow/muted`. Full-account mute is separate from feed preferences (hide post/author, mute keywords) — see [ADR-0004](./adr/0004-feed-preferences.md).

---

## 7. Notifications

### notifications
- `id` (PK)
- `recipientId` (FK → profiles.id)
- `senderId` (nullable FK → profiles.id)
- `type` (`NotificationType` enum)
- `content`
- `read`
- `postId` (nullable FK → posts.id)
- `storyId` (nullable FK → stories.id)
- `reportId` (nullable FK → reports.id)
- `messageId` (nullable FK → messages.id)
- `targetType`
- `targetId`
- `createdAt`

---

## 8. Messaging

### conversations
- `id` (PK)
- `createdAt`
- `updatedAt`
- `name`
- `isGroup`

### participants
- `id` (PK)
- `conversationId` (FK → conversations.id)
- `profileId` (FK → profiles.id)
- `isAdmin`, `lastReadAt`, `deletedAt`, `clearedAt`
- `createdAt`
- UNIQUE (`conversationId`, `profileId`)

### messages
- `id` (PK)
- `conversationId` (FK → conversations.id)
- `senderId` (FK → profiles.id)
- `content`
- `mediaUrl`
- `mediaType`
- `postId` (nullable FK → posts.id)
- `storyId` (nullable FK → stories.id)
- `replyToId` (nullable FK → messages.id)
- `createdAt`
- `updatedAt`

### message_reactions
- `id` (PK)
- `messageId` (FK → messages.id)
- `profileId` (FK → profiles.id)
- `reaction`
- `createdAt`
- UNIQUE (`messageId`, `profileId`)

---

## 9. Monetization

### platform_plans
- `id` (PK)
- `name`
- `description`
- `priceCents` (source of truth)
- `yearlyPriceCents` (nullable)
- `currency`
- `interval`
- `stripeProductId` (UNIQUE)
- `stripePriceId` (UNIQUE)
- `yearlyStripePriceId` (UNIQUE)
- `features` (JSON — see internal schema below)
- `isActive`
- `createdAt`
- `updatedAt`

**Internal schema of the `features` field (JSON array)**

```json
[
  {
    "key": "string",
    "label": "string",
    "enabled": true,
    "limit": null
  }
]
```

| Field     | Type             | Description                                                             |
|-----------|------------------|-------------------------------------------------------------------------|
| `key`     | string (enum)    | Business identifier for the benefit (see feature keys table)            |
| `label`   | string           | UI text to show the user                                                |
| `enabled` | boolean          | Whether the benefit is active on this plan                              |
| `limit`   | number \| null   | Numeric limit if applicable (e.g. posts per day); null = unlimited      |

**Valid feature keys**

| Key                    | Description                                         |
|------------------------|-----------------------------------------------------|
| `verified_badge`       | Verification badge visible on profile               |
| `analytics_basic`      | Basic analytics for posts and profile               |
| `analytics_advanced`   | Advanced analytics with history and demographics    |
| `priority_support`     | Priority support                                    |
| `promotions_enabled`   | Access to launch promotions                         |
| `extended_storage`     | Extended storage for media                          |
| `hide_ads`             | No ads in feed (if applicable in the future)        |
| `early_access`         | Early access to new features                        |

**Example real value for a Premium plan**
```json
[
  { "key": "verified_badge", "label": "Verified badge", "enabled": true, "limit": null },
  { "key": "analytics_basic", "label": "Basic analytics", "enabled": true, "limit": null },
  { "key": "analytics_advanced", "label": "Advanced analytics", "enabled": false, "limit": null },
  { "key": "promotions_enabled", "label": "Promotions", "enabled": true, "limit": null },
  { "key": "priority_support", "label": "Priority support", "enabled": true, "limit": null }
]
```

### platform_subscriptions
- `id` (PK)
- `userId` (FK → users.id)
- `planId` (FK → platform_plans.id)
- `status`
- `stripeSubscriptionId` (UNIQUE)
- `currentPeriodStart`
- `currentPeriodEnd`
- `cancelAtPeriodEnd`
- `createdAt`
- `updatedAt`
- UNIQUE (`userId`, `planId`)

### webhook_events
- `id` (PK)
- `provider`
- `externalId` (UNIQUE)
- `payload` (JSON)
- `status`
- `createdAt`
- `updatedAt`
- `processedAt`

### promotions
- `id` (PK)
- `userId` (FK → users.id) — billing account (not profile)
- `targetType`
- `targetId`
- `budgetCents` (remaining budget; integer cents)
- `dailyBudgetCents` (nullable; integer cents)
- `currency`
- `status` (`PENDING | ACTIVE | COMPLETED | REJECTED | CANCELLED | FAILED`)
- `stripePaymentIntentId` (UNIQUE)
- `chargedAt`
- `refundPolicy` (`PROPORTIONAL | NONE`)
- `refundedAt`
- `startDate`
- `endDate`
- `reach`
- `createdAt`
- `updatedAt`

### creator_subscriptions

**Removed** from live schema (migration `20260729154648_sync_schema_again`). Creator VIP billing paths use Stripe + `Transaction` / application logic; do not reintroduce this table without a new ADR.

---

## 10. Live, polls, and Q&A

### live_streams
- `id` (PK)
- `hostId` (FK → profiles.id)
- `coHostId` (nullable FK → profiles.id)
- `title` (nullable)
- `status` (`LiveStatus`: `LIVE | ENDED`)
- `viewerCount`
- `startedAt`
- `endedAt` (nullable)
- `hlsUrl` (nullable)
- `replayUrl` (nullable)
- Endpoints: `POST /live/start`, `POST /live/end`, `GET /live/active`, `GET /live/:streamId`, `GET /live/join/:streamId`, co-host invite/accept/remove, `POST /live/:streamId/gift`.
- **Gifts are billed**: Stripe Checkout + `LiveGift` + `TransactionType.DIRECT_LIVE_GIFT` (20% application fee); webhook completion emits `live:gift`; catalog prices are server-side.

### polls
- `id` (PK)
- `postId` (nullable, UNIQUE, FK → posts.id)
- `storyId` (nullable, UNIQUE, FK → stories.id)
- `question`
- `options` (string array)
- `createdAt`
- A poll belongs to exactly one post or story.

### poll_votes
- `id` (PK)
- `pollId` (FK → polls.id)
- `profileId` (FK → profiles.id)
- `optionIndex`
- `createdAt`
- UNIQUE (`pollId`, `profileId`)

### qna_boxes
- `id` (PK)
- `postId` (nullable, UNIQUE, FK → posts.id)
- `storyId` (nullable, UNIQUE, FK → stories.id)
- `prompt`
- `createdAt`

### qna_answers
- `id` (PK)
- `qnaBoxId` (FK → qna_boxes.id)
- `profileId` (FK → profiles.id)
- `answerText`
- `createdAt`
- Endpoints: `POST /interactive/poll`, `GET /interactive/poll/:id`, `POST /interactive/poll/vote`, `POST /interactive/qna`, `GET /interactive/qna/:id`, `POST /interactive/qna/answer`.

---

## 11. Moderation and operations

### reports
- `id` (PK)
- `reporterId` (FK → profiles.id)
- `reason`
- `details`
- `status` (`PENDING | REVIEWING | RESOLVED | REJECTED`)
- `targetType` (`post | comment | user | story | message`)
- `targetId`
- `assignedAdminId` (nullable FK → admin_identities.id) — operator who claimed/handled the report
- `resolvedAt` (nullable timestamp)
- `internalNotes`
- `createdAt`
- `updatedAt`

### admin_audit_logs
- `id` (PK)
- `adminId` (nullable FK → admin_identities.id)
- `legacyUserId` (nullable — pre–AdminIdentity migration rows)
- `action`
- `targetType`
- `targetId`
- `details`
- `ipAddress`, `userAgent`, `requestId`
- `createdAt`

### appeals
- `id` (PK)
- `userId` (FK → users.id)
- `targetType` (`AppealTargetType`: `ACCOUNT_BAN | POST_REMOVAL`)
- `targetId` (nullable)
- `reason`
- `status` (`AppealStatus`: `PENDING | APPROVED | REJECTED`)
- `adminNotes` (nullable)
- `createdAt`
- `updatedAt`
- Persisted appeals module, exposed at `POST /appeals`, `GET /appeals/my-appeals`, `GET /appeals/admin`, `PATCH /appeals/admin/:id`; surfaced in the app under `Settings → Appeals`. Note: `AdminAuditLog`/`Report` still model general moderation trace; there is no separate `ModerationAction` table.

### search_history
- `id` (PK)
- `profileId` (FK → profiles.id)
- `query`
- `createdAt`
- `expiresAt` (GDPR retention)

### whitelist_entries
- `id` (PK)
- `email` (UNIQUE)
- `name`
- `status`
- `createdAt`
- `updatedAt`

---

## 12. Main relationships

- `users` 1 ── N `profiles` (v1 product uses one primary profile per account)
- `users` 1 ── N `refresh_tokens`
- `users` 1 ── N `passkeys`
- `profiles` 1 ── N `posts`
- `posts` 1 ── N `post_media`
- `posts` 1 ── N `comments`
- `posts` 1 ── N `likes`
- `posts` 1 ── N `bookmarks`
- `posts` N ── N `hashtags` via `post_hashtags`
- `posts` 1 ── 1 `post_embeddings`
- `profiles` N ── N `posts` via `post_tags`
- `profiles` 1 ── N `stories`
- `stories` 1 ── N `story_views`
- `stories` 1 ── N `story_reactions`
- `profiles` 1 ── N `highlights`
- `highlights` N ── N `stories` via `highlight_stories`
- `profiles` 1 ── N `comments`
- `comments` 1 ── N `comment_likes`
- `comments` 1 ── N `comments` (self-reference)
- `profiles` 1 ── N `bookmarks`
- `profiles` 1 ── N `collections`
- `profiles` 1 ── N `follows` as follower
- `profiles` 1 ── N `follows` as following
- `profiles` 1 ── N `blocks` as blocker
- `profiles` 1 ── N `blocks` as blocked
- `profiles` 1 ── N `notifications` as recipient
- `profiles` 1 ── N `notifications` as sender
- `conversations` 1 ── N `participants`
- `conversations` 1 ── N `messages`
- `messages` 1 ── N `message_reactions`
- `messages` 1 ── N `messages` (reply chain)
- `users` 1 ── N `platform_subscriptions`
- `platform_plans` 1 ── N `platform_subscriptions`
- `users` 1 ── N `promotions`
- `profiles` 1 ── N `close_friends` as owner (`profileId`)
- `profiles` 1 ── N `close_friends` as friend (`friendId`)
- `profiles` 1 ── N `reports` as reporter
- `admin_identities` 1 ── N `reports` as assignee
- `admin_identities` 1 ── N `admin_audit_logs`

### Money units
- Prefer `*Cents` Int columns (`priceCents`, `budgetCents`, `amountCents`, `lifetimeEarningsCents`).
- `transactions.amount` is **already integer cents** under the legacy field name `amount` (public API contract — do not rename without a versioned migration).
- `users` 1 ── 1 `user_settings`
- `audio_tracks` 1 ── N `posts`
- `audio_tracks` 1 ── N `stories`
- `profiles` 1 ── N `mutes` as muter
- `profiles` 1 ── N `mutes` as muted
- `users` 1 ── N `appeals`
- `profiles` 1 ── N `live_streams` as host
- `profiles` 1 ── N `live_streams` as co-host
- `posts` 1 ── 0..1 `polls` / `qna_boxes`
- `stories` 1 ── 0..1 `polls` / `qna_boxes`
- `profiles` 1 ── 1 `profile_embeddings`
- `profiles` 1 ── N `search_history`

---

## 13. Differences from prior documentation

### Corrected (superseded — see revision note below)
- `frames` are no longer documented as a separate table; they become `Post.type = FRAME`.
- `likes` are no longer polymorphic; separate `Like` and `CommentLike` exist.
- `user_settings`, `feature_entitlements`, and separate analytics tables are removed from the current official ERD.
- `chat`, `highlights`, `collections`, `passkeys`, `promotions`, `audio`, `search_history`, `whitelist_entries`, `user_settings`, and `post_embeddings` now appear in the official ERD.

### Revision note (Aug 2026)
**User/Profile split:** Social FKs documented as `profileId` / `profiles.id` (not `userId` on posts, likes, follows, chat, etc.). `username` lives on `Profile`. Admin audit/assignee references `AdminIdentity`. `creator_subscriptions` table removed from schema. See [15-identity-profile-model.md](./15-identity-profile-model.md).

An earlier revision (Jul 2026) stated that `mutes`, `appeals`, and `moderation_actions` were "removed from the official ERD." That was inaccurate for `mutes` and `appeals`: both are real, persisted models in the live `schema.prisma` (`mutes` → §6, `appeals` → §11) and are wired to shipped API endpoints and UI (mute/unmute on profile and post menus; `Settings → Appeals`). There is still **no** separate `moderation_actions` table — `Report` + `AdminAuditLog` (+ `Appeal`) remain the persisted moderation surface. Feed-preference tables (`feed_hidden_posts`, `feed_hidden_authors`, `feed_muted_keywords`) **are implemented** — see [ADR-0004](./adr/0004-feed-preferences.md). Live gifts are billed (`LiveGift` + `DIRECT_LIVE_GIFT`).

### Kept as future application logic
- A dedicated `ModerationAction` table (currently unmodeled; traceability lives in `AdminAuditLog`/`Report`).
- Aggregated analytics persisted in dedicated tables.
- Communities and marketplace.
