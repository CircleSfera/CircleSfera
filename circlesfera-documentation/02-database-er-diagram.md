# 02-Database-ER-Diagram
## CircleSfera
**Version:** 3.0 aligned with the real schema  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Source of truth:** current project `schema.prisma`

---

## 1. Modeling criteria

This ERD describes the reality of the project's current model. It does not simplify toward an outdated MVP, nor does it add entities that do not exist in the shared `schema.prisma`.

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
- `userId` (UNIQUE, FK → users.id)
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

---

## 3. Primary content

### posts
- `id` (PK)
- `userId` (FK → users.id)
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
- `userId` (FK → users.id)
- `x`
- `y`
- `createdAt`
- UNIQUE (`postId`, `userId`)

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
- `userId` (FK → users.id)
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
- `viewerId` (FK → users.id)
- `createdAt`
- UNIQUE (`storyId`, `viewerId`)

### story_reactions
- `id` (PK)
- `storyId` (FK → stories.id)
- `userId` (FK → users.id)
- `reaction`
- `createdAt`
- UNIQUE (`storyId`, `userId`)

### highlights
- `id` (PK)
- `userId` (FK → users.id)
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
- `userId` (FK → users.id)
- `friendId`
- `createdAt`
- UNIQUE (`userId`, `friendId`)

---

## 5. Interactions

### comments
- `id` (PK)
- `postId` (FK → posts.id)
- `userId` (FK → users.id)
- `content`
- `mediaUrl`
- `mediaType`
- `createdAt`
- `updatedAt`
- `parentId` (nullable FK → comments.id)

### likes
- `id` (PK)
- `postId` (FK → posts.id)
- `userId` (FK → users.id)
- `createdAt`
- UNIQUE (`postId`, `userId`)

### comment_likes
- `id` (PK)
- `commentId` (FK → comments.id)
- `userId` (FK → users.id)
- `createdAt`
- UNIQUE (`commentId`, `userId`)

### bookmarks
- `id` (PK)
- `userId` (FK → users.id)
- `postId` (FK → posts.id)
- `collectionId` (nullable FK → collections.id)
- `createdAt`
- UNIQUE (`userId`, `postId`)

### collections
- `id` (PK)
- `userId` (FK → users.id)
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
- `followerId` (FK → users.id)
- `followingId` (FK → users.id)
- `status` (`PENDING | ACCEPTED`)
- `createdAt`
- UNIQUE (`followerId`, `followingId`)

### blocks
- `id` (PK)
- `blockerId` (FK → users.id)
- `blockedId` (FK → users.id)
- `createdAt`
- UNIQUE (`blockerId`, `blockedId`)

### mutes
- `id` (PK)
- `muterId` (FK → users.id)
- `mutedId` (FK → users.id)
- `createdAt`
- UNIQUE (`muterId`, `mutedId`)
- Excludes the muted user's posts from `FeedService` queries (`foryou` and `following`); exposed via `POST/DELETE /users/:username/follow/mute` and `GET /users/me/follow/muted`. Full-account mute only — no per-keyword or per-post muting yet (see [ADR-0004](./adr/0004-feed-preferences.md)).

---

## 7. Notifications

### notifications
- `id` (PK)
- `recipientId` (FK → users.id)
- `senderId` (nullable FK → users.id)
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
- `userId` (FK → users.id)
- `lastReadAt`
- `createdAt`
- UNIQUE (`conversationId`, `userId`)

### messages
- `id` (PK)
- `conversationId` (FK → conversations.id)
- `senderId` (FK → users.id)
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
- `userId` (FK → users.id)
- `reaction`
- `createdAt`
- UNIQUE (`messageId`, `userId`)

---

## 9. Monetization

### platform_plans
- `id` (PK)
- `name`
- `description`
- `price`
- `yearlyPrice`
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
- `userId` (FK → users.id)
- `targetType`
- `targetId`
- `budget`
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
- `id` (PK)
- `subscriberId` (FK → users.id)
- `creatorId` (FK → users.id)
- `status` (`SubscriptionStatus`)
- `priceCents`
- `stripeSubscriptionId` (UNIQUE, nullable)
- `expiresAt`
- `autoRenew`
- `createdAt`
- `updatedAt`
- UNIQUE (`subscriberId`, `creatorId`)
- Creator-to-creator VIP subscription (distinct from `platform_subscriptions`, which is the platform tier). Canonical price is `Profile.subscriptionPriceCents`, editable via `PATCH /creator/subscription-price`.

---

## 10. Live, polls, and Q&A

### live_streams
- `id` (PK)
- `hostId` (FK → users.id)
- `coHostId` (nullable FK → users.id)
- `title` (nullable)
- `status` (`LiveStatus`: `LIVE | ENDED`)
- `viewerCount`
- `startedAt`
- `endedAt` (nullable)
- `hlsUrl` (nullable)
- `replayUrl` (nullable)
- Endpoints: `POST /live/start`, `POST /live/end`, `GET /live/active`, `GET /live/:streamId`, `GET /live/join/:streamId`, co-host invite/accept/remove, `POST /live/:streamId/gift`.
- **Gifts are not billed**: `LiveService.sendGift` broadcasts a gift event only; it does not create a `Transaction` or charge Stripe (`CreatorService.giftsTotal` is hardcoded `0`).

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
- `userId` (FK → users.id)
- `optionIndex`
- `createdAt`
- UNIQUE (`pollId`, `userId`)

### qna_boxes
- `id` (PK)
- `postId` (nullable, UNIQUE, FK → posts.id)
- `storyId` (nullable, UNIQUE, FK → stories.id)
- `prompt`
- `createdAt`

### qna_answers
- `id` (PK)
- `qnaBoxId` (FK → qna_boxes.id)
- `userId` (FK → users.id)
- `answerText`
- `createdAt`
- Endpoints: `POST /interactive/poll`, `GET /interactive/poll/:id`, `POST /interactive/poll/vote`, `POST /interactive/qna`, `GET /interactive/qna/:id`, `POST /interactive/qna/answer`.

---

## 11. Moderation and operations

### reports
- `id` (PK)
- `reporterId` (FK → users.id)
- `reason`
- `details`
- `status` (`PENDING | REVIEWING | RESOLVED | REJECTED`)
- `targetType` (`post | comment | user | story | message`)
- `targetId`
- `reviewedBy` (nullable FK → users.id) — admin who handled the report
- `resolvedAt` (nullable timestamp) — when the report was closed
- `createdAt`
- `updatedAt`

### admin_audit_logs
- `id` (PK)
- `adminId` (FK → users.id)
- `action`
- `targetType`
- `targetId`
- `details`
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
- `userId` (FK → users.id)
- `query`
- `createdAt`

### whitelist_entries
- `id` (PK)
- `email` (UNIQUE)
- `name`
- `status`
- `createdAt`
- `updatedAt`

### user_settings
- `id` (PK)
- `userId` (UNIQUE, FK → users.id)
- `privacyLevel` (`PUBLIC | FOLLOWERS | PRIVATE`)
- `contentPreference` (`GENERAL | MATURE`)
- `blurSensitiveContent`
- `emailNotifications`
- `pushNotifications`
- `updatedAt`

---

## 12. Main relationships

- `users` 1 ── 1 `profiles`
- `users` 1 ── N `refresh_tokens`
- `users` 1 ── N `passkeys`
- `users` 1 ── N `posts`
- `posts` 1 ── N `post_media`
- `posts` 1 ── N `comments`
- `posts` 1 ── N `likes`
- `posts` 1 ── N `bookmarks`
- `posts` N ── N `hashtags` via `post_hashtags`
- `posts` 1 ── 1 `post_embeddings`
- `users` N ── N `posts` via `post_tags`
- `users` 1 ── N `stories`
- `stories` 1 ── N `story_views`
- `stories` 1 ── N `story_reactions`
- `users` 1 ── N `highlights`
- `highlights` N ── N `stories` via `highlight_stories`
- `users` 1 ── N `comments`
- `comments` 1 ── N `comment_likes`
- `comments` 1 ── N `comments` (self-reference)
- `users` 1 ── N `bookmarks`
- `users` 1 ── N `collections`
- `users` 1 ── N `follows` as follower
- `users` 1 ── N `follows` as following
- `users` 1 ── N `blocks` as blocker
- `users` 1 ── N `blocks` as blocked
- `users` 1 ── N `notifications` as recipient
- `users` 1 ── N `notifications` as sender
- `conversations` 1 ── N `participants`
- `conversations` 1 ── N `messages`
- `messages` 1 ── N `message_reactions`
- `messages` 1 ── N `messages` (reply chain)
- `users` 1 ── N `platform_subscriptions`
- `platform_plans` 1 ── N `platform_subscriptions`
- `users` 1 ── N `promotions`
- `users` 1 ── N `reports`
- `users` 1 ── N `admin_audit_logs`
- `users` 1 ── 1 `user_settings`
- `audio_tracks` 1 ── N `posts`
- `audio_tracks` 1 ── N `stories`
- `users` 1 ── N `mutes` as muter
- `users` 1 ── N `mutes` as muted
- `users` 1 ── N `appeals`
- `users` 1 ── N `live_streams` as host
- `users` 1 ── N `live_streams` as co-host
- `posts` 1 ── 0..1 `polls` / `qna_boxes`
- `stories` 1 ── 0..1 `polls` / `qna_boxes`
- `users` 1 ── N `creator_subscriptions` as subscriber
- `users` 1 ── N `creator_subscriptions` as creator
- `profiles` 1 ── 1 `profile_embeddings`

---

## 13. Differences from prior documentation

### Corrected (superseded — see revision note below)
- `frames` are no longer documented as a separate table; they become `Post.type = FRAME`.
- `likes` are no longer polymorphic; separate `Like` and `CommentLike` exist.
- `user_settings`, `feature_entitlements`, and separate analytics tables are removed from the current official ERD.
- `chat`, `highlights`, `collections`, `passkeys`, `promotions`, `audio`, `search_history`, `whitelist_entries`, `user_settings`, and `post_embeddings` now appear in the official ERD.

### Revision note (Jul 2026)
An earlier revision of this document stated that `mutes`, `appeals`, and `moderation_actions` were "removed from the official ERD." That was inaccurate for `mutes` and `appeals`: both are real, persisted models in the live `schema.prisma` (`mutes` → §6, `appeals` → §11) and are wired to shipped API endpoints and UI (mute/unmute on profile and post menus; `Settings → Appeals`). There is still **no** separate `moderation_actions` table — `Report` + `AdminAuditLog` (+ `Appeal`) remain the persisted moderation surface. `feed_preferences` (hide post/author, mute keywords) genuinely does not exist yet; see [ADR-0004](./adr/0004-feed-preferences.md).

### Kept as future application logic
- A dedicated `ModerationAction` table (currently unmodeled; traceability lives in `AdminAuditLog`/`Report`).
- Feed-preference domain tables (hide post/author, mute keywords) — see [ADR-0004](./adr/0004-feed-preferences.md).
- Aggregated analytics persisted in dedicated tables.
- Communities and marketplace.
