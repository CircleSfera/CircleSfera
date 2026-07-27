# Glossary — product term to data model

Maps the words used in conversation to what actually exists in
`circlesfera-backend/prisma/schema.prisma` (65 models, 27 enums). **Always re-read the schema before
relying on an enum value or field name**; this file is a navigation aid, not the source of truth.

## Terms that are commonly gotten wrong

| Term | Reality |
| --- | --- |
| **Frame** | Short video. There is **no `Frame` model** — it is `Post` with `type = PostType.FRAME`. |
| **Story** | `Story` model, expires via `expiresAt`; `Highlight` + `HighlightStory` make it persistent. |
| **Payout** | No payout table. `payout_requests` and `PayoutStatus` were dropped in migration `20260723020000_appeals_profile_embeddings_drop_payouts`. Balance is read from Stripe Connect ([ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)). |
| **Plan / tier** | `PlatformPlan` rows, **not an enum**. Names are strings: `Premium`, `Elite Creator`, `Business`. |
| **VIP / creator subscription** | `CreatorSubscription`; the price lives on `Profile.subscriptionPriceCents`, not on a plan row. |
| **Promotion / ads** | `Promotion` model; "Promote" in the UI. Paid with Stripe Checkout, ledgered as `TransactionType.PROMOTION_PAYMENT`. |
| **Newsletter** | No Prisma model. Email is a service (`src/email/`) using Brevo. |
| **WebRTC / calls** | No model. Signalling in `src/socket/app.gateway.ts`, ICE config in `src/webrtc/`. Live streaming uses LiveKit ([ADR-0005](../../circlesfera-documentation/adr/0005-livekit-live-streaming.md)). |
| **Conversation / DM** | `Conversation` + `Participant` + `Message` (+ `MessageReaction`). Message content is encrypted at rest by `CryptoService`. |
| **Feed preferences** | Real tables: `FeedHiddenPost`, `FeedHiddenAuthor`, `FeedMutedKeyword` ([ADR-0004](../../circlesfera-documentation/adr/0004-feed-preferences.md)). |
| **Embeddings** | `PostEmbedding`, `ProfileEmbedding`, pgvector `vector` extension. |
| **Purchase** | Exists as an interface in `circlesfera-shared` but has **no Prisma model**. Do not build on it. |

## Models by domain

**Identity** `User`, `Profile`, `RefreshToken`, `Passkey`, `UserSettings`, `DataExportRequest`,
`CloseFriend`

**Content** `Post`, `PostMedia`, `PostTag`, `PostView`, `Story`, `StoryView`, `StoryReaction`,
`Highlight`, `HighlightStory`, `EditProject`, `Hashtag`, `PostHashtag`

**Social** `Follow`, `Like`, `Comment`, `CommentLike`, `Bookmark`, `Collection`, `Block`, `Mute`

**Chat** `Conversation`, `Participant`, `Message`, `MessageReaction`

**Money** `PlatformPlan`, `PlatformSubscription`, `Monetization`, `PostUnlock`, `StoryUnlock`,
`Transaction`, `CreatorSubscription`, `WebhookEvent`, `Promotion`, `LiveGift`

**Trust & safety** `Report`, `Appeal`, `ModerationSignature`, `AdminAuditLog`

**Engagement** `Notification`, `PushSubscription`, `Poll`, `PollVote`, `QnaBox`, `QnaAnswer`,
`Audio`, `LiveStream`

**Discovery & data** `PostEmbedding`, `ProfileEmbedding`, `SearchHistory`, `FeatureFlag`,
`UserExperiment`, `UserMetric`, `InteractionEvent`

**Feed control** `FeedHiddenPost`, `FeedHiddenAuthor`, `FeedMutedKeyword`

**Support & access** `SupportTicket`, `WhitelistEntry`

## Load-bearing enums

Verify in the schema before use; these are the ones most often referenced.

| Enum | Values |
| --- | --- |
| `Role` | `USER`, `ADMIN`, `MODERATOR` |
| `VerificationLevel` | `BASIC`, `VERIFIED`, `BUSINESS`, `ELITE` |
| `AccountType` | `PERSONAL`, `CREATOR`, `BUSINESS` |
| `PostType` | `POST`, `FRAME` |
| `Visibility` | `PUBLIC`, `FOLLOWERS`, `PRIVATE` |
| `ContentRating` | `GENERAL`, `MATURE` |
| `ModerationStatus` | `VISIBLE`, `FLAGGED`, `HIDDEN`, `REMOVED` |
| `FollowStatus` | `PENDING`, `ACCEPTED` |
| `SubscriptionStatus` | `ACTIVE`, `TRIALING`, `PAST_DUE`, `INCOMPLETE`, `CANCELLED`, `EXPIRED` |
| `TransactionType` | `DIRECT_POST_UNLOCK`, `DIRECT_STORY_UNLOCK`, `DIRECT_TIP`, `DIRECT_LIVE_GIFT`, `STRIPE_SUBSCRIPTION`, `PROMOTION_PAYMENT` |
| `TransactionStatus` | `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED` |
| `PromotionStatus` | `PENDING`, `ACTIVE`, `PAUSED`, `COMPLETED`, `REJECTED`, `CANCELLED`, `FAILED` |
| `PromotionTargetType` | `POST`, `STORY`, `PROFILE` |
| `PromotionRefundPolicy` | `PROPORTIONAL`, `NONE` |
| `ReportTargetType` | `USER`, `POST`, `COMMENT`, `STORY`, `MESSAGE` |
| `ReportStatus` | `PENDING`, `REVIEWING`, `RESOLVED`, `REJECTED` |
| `AppealTargetType` | `ACCOUNT_BAN`, `POST_REMOVAL` |
| `AppealStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `LiveStatus` | `LIVE`, `ENDED` |
| `ScheduledPostStatus` | `SCHEDULED`, `PUBLISHED`, `CANCELLED` |
| `ExportStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `TicketStatus` | `OPEN`, `RESOLVED`, `CLOSED` |
| `WhitelistStatus` | `VALID`, `REGISTERED` |

Also in the schema, with long value lists — read them there rather than from memory:
`NotificationType` (11 values), `ReportReason` (9), `AdminAction` (29), `UserEventType` (15).

## Operational vocabulary

| Term | Meaning here |
| --- | --- |
| **Studio** | Creator Studio, route `/creator/:tab`, gated by `CreatorStudioGuard` and the `Elite Creator` plan on data endpoints. |
| **Edits** | Video editing surface, route `/edits`, backed by `EditProject` and the `edits-processing` queue. |
| **Platform fee** | 20% Stripe `application_fee` on Connect charges ([ADR-0010](../../circlesfera-documentation/adr/0010-platform-fee-20-percent.md)). |
| **PPV** | Pay-per-view content: `Post.isPremium`/`priceCents` + `PostUnlock`, `Story.isPremium` + `StoryUnlock`. |
| **Fan-out** | `feed-fanout` queue writing feed inbox rows ([ADR-0009](../../circlesfera-documentation/adr/0009-feed-fan-out.md)). |
| **Anti-shadowban label** | Moderation visibility labelling required by the no-hidden-suppression principle. |
| **Whitelist** | Invite/allow-list entries (`WhitelistEntry`), admin-managed. |
