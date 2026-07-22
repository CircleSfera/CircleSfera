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

---

## 10. Moderation and operations

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

## 11. Main relationships

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

---

## 12. Differences from prior documentation

### Corrected
- `frames` are no longer documented as a separate table; they become `Post.type = FRAME`.
- `likes` are no longer polymorphic; separate `Like` and `CommentLike` exist.
- `mutes` are removed from the current official ERD.
- `appeals` and `moderation_actions` are removed from the current official ERD.
- `user_settings`, `feed_preferences`, `feature_entitlements`, `platform_transactions`, and separate analytics tables are removed from the current official ERD.
- `chat`, `highlights`, `collections`, `passkeys`, `promotions`, `audio`, `search_history`, `whitelist_entries`, `user_settings`, and `post_embeddings` now appear in the official ERD.

### Kept as future application logic
- Advanced appeal workflows.
- Aggregated analytics persisted in dedicated tables.
- Communities and marketplace.
