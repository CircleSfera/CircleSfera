# 02-Database-ER-Diagram
## CircleSfera
**Versión:** 3.0 alineada al schema real  
**Base de datos:** PostgreSQL  
**ORM:** Prisma  
**Fuente de verdad:** `schema.prisma` actual del proyecto

---

## 1. Criterio de modelado

Este ERD describe la realidad del modelo actual del proyecto. No simplifica hacia un MVP antiguo ni añade entidades que no existan en el `schema.prisma` compartido.

---

## 2. Entidades de identidad

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

## 3. Contenido principal

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
- PK compuesta (`postId`, `hashtagId`)

### post_embeddings
- `postId` (PK, FK → posts.id)
- `vector` (`vector(1536)` vía pgvector)

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

## 4. Stories y derivados

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

## 5. Interacciones

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

## 6. Grafo social

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

## 7. Notificaciones

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

## 8. Mensajería

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

## 9. Monetización

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
- `features` (JSON — ver schema interno abajo)
- `isActive`
- `createdAt`
- `updatedAt`

**Schema interno del campo `features` (JSON array)**

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

| Campo     | Tipo             | Descripción                                                             |
|-----------|------------------|-------------------------------------------------------------------------|
| `key`     | string (enum)    | Identificador de negocio del beneficio (ver tabla de feature keys)      |
| `label`   | string           | Texto de UI para mostrar al usuario                                     |
| `enabled` | boolean          | Si el beneficio está activo en este plan                                |
| `limit`   | number \| null   | Límite numérico si aplica (ej: posts por día); null = sin límite        |

**Feature keys válidos**

| Key                    | Descripción                                         |
|------------------------|-----------------------------------------------------|
| `verified_badge`       | Badge de verificación visible en perfil             |
| `analytics_basic`      | Analytics básicas de posts y perfil                 |
| `analytics_advanced`   | Analytics avanzadas con histórico y demografía      |
| `priority_support`     | Soporte prioritario                                 |
| `promotions_enabled`   | Acceso a lanzar promotions                          |
| `extended_storage`     | Almacenamiento extendido para media                 |
| `hide_ads`             | Sin publicidad en feed (si aplica en el futuro)     |
| `early_access`         | Acceso anticipado a nuevas funciones                |

**Ejemplo de valor real para un plan Premium**
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

## 10. Moderación y operación

### reports
- `id` (PK)
- `reporterId` (FK → users.id)
- `reason`
- `details`
- `status` (`PENDING | REVIEWING | RESOLVED | REJECTED`)
- `targetType` (`post | comment | user | story | message`)
- `targetId`
- `reviewedBy` (nullable FK → users.id) — admin que gestionó el report
- `resolvedAt` (nullable timestamp) — momento de cierre del report
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

## 11. Relaciones principales

- `users` 1 ── 1 `profiles`
- `users` 1 ── N `refresh_tokens`
- `users` 1 ── N `passkeys`
- `users` 1 ── N `posts`
- `posts` 1 ── N `post_media`
- `posts` 1 ── N `comments`
- `posts` 1 ── N `likes`
- `posts` 1 ── N `bookmarks`
- `posts` N ── N `hashtags` vía `post_hashtags`
- `posts` 1 ── 1 `post_embeddings`
- `users` N ── N `posts` vía `post_tags`
- `users` 1 ── N `stories`
- `stories` 1 ── N `story_views`
- `stories` 1 ── N `story_reactions`
- `users` 1 ── N `highlights`
- `highlights` N ── N `stories` vía `highlight_stories`
- `users` 1 ── N `comments`
- `comments` 1 ── N `comment_likes`
- `comments` 1 ── N `comments` (self-reference)
- `users` 1 ── N `bookmarks`
- `users` 1 ── N `collections`
- `users` 1 ── N `follows` como follower
- `users` 1 ── N `follows` como following
- `users` 1 ── N `blocks` como blocker
- `users` 1 ── N `blocks` como blocked
- `users` 1 ── N `notifications` como recipient
- `users` 1 ── N `notifications` como sender
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

## 12. Diferencias respecto a la documentación anterior

### Se corrige
- `frames` dejan de documentarse como tabla separada; pasan a ser `Post.type = FRAME`.
- `likes` dejan de ser polimórficos; existen `Like` y `CommentLike` por separado.
- `mutes` salen del ERD oficial actual.
- `appeals` y `moderation_actions` salen del ERD oficial actual.
- `user_settings`, `feed_preferences`, `feature_entitlements`, `platform_transactions` y tablas analíticas separadas salen del ERD oficial actual.
- `chat`, `highlights`, `collections`, `passkeys`, `promotions`, `audio`, `search_history`, `whitelist_entries`, `user_settings` y `post_embeddings` pasan a figurar en el ERD oficial.

### Se mantiene como lógica de aplicación futura
- Workflows avanzados de apelación.
- Analítica agregada persistida en tablas dedicadas.
- Communities y marketplace.
