# 04-User-Stories
## CircleSfera
**Version:** 3.0 aligned with the real project  
**Date:** April 2026  
**Source of truth:** updated documentation scope + current `schema.prisma`

---

## 1. Correction criteria

This document replaces the previous version of user stories to align them with the project's reality. The main correction is that CircleSfera is no longer documented as a reduced MVP of posts and follows, but as a platform whose current model already supports stories, frames as a post variant, bookmarks, collections, highlights, chat, passkeys, promotions, reporting, platform plans, mutes, appeals, live streaming, and polls/Q&A.

**Jul 2026 correction:** an earlier revision of this document said stories for persisted `mutes` and persisted `appeals` were removed because those entities didn't exist. That is no longer accurate — `Mute` and `Appeal` are real, persisted models in `schema.prisma` with shipped endpoints and UI (see §3.5 and §3.11). What genuinely remains unmodeled: a dedicated `moderation_actions` table (traceability instead lives in `Report` + `AdminAuditLog` + `Appeal`) and persisted feed preferences (hide post/author, mute keywords — see [ADR-0004](./adr/0004-feed-preferences.md)) or detailed analytics backed by their own tables.

---

## 2. Current epics

### EPIC-1: Identity and access
Includes registration, login, refresh token, password recovery, email verification, and passkeys.

### EPIC-2: Profile and account
Includes profile editing, account privacy, public/private visibility, and basic social status.

### EPIC-3: Publishing and content
Includes posts, frames as a post type, media, hashtags, tags, comments, likes, and visibility.

### EPIC-4: Stories and ephemeral layers
Includes stories, views, reactions, close friends, and highlights.

### EPIC-5: Social interaction
Includes follows, blocks, bookmarks, collections, and notifications.

### EPIC-6: Messaging
Includes conversations, messages, replies, reactions, and sharing of posts/stories in chat.

### EPIC-7: Platform monetization
Includes plans, subscriptions, webhooks, and promotion/boost initiatives.

### EPIC-8: Trust, safety, and operations
Includes reports, administrative audit, verification, account security, and operational traceability.

### EPIC-9: Search and discovery
Includes user/hashtag search, search history, and evolution toward embedding-based recommendations.

### EPIC-10: Live, polls, and Q&A
Includes live streaming with co-hosts and gifting, and interactive polls/Q&A attached to posts or stories.

### EPIC-11: Appeals
Includes user-submitted appeals of moderation decisions and admin review/resolution.

---

## 3. User stories

## 3.1 Auth

### US-001 Registration
**As a** visitor  
**I want** to create an account with email, password, and username  
**So that** I can access CircleSfera

**Acceptance criteria**
- The system validates unique email.
- The system validates unique username.
- Initial `User` and `Profile` are created.
- An email verification flow is issued.
- The password is stored hashed.

### US-002 Login
**As a** registered user  
**I want** to sign in with email and password, and later with passkey  
**So that** I can access securely

**Acceptance criteria**
- The system allows login by email.
- An access token and refresh token are issued.
- The user can sign out by revoking active sessions.
- The system can incorporate passkey login without redesigning the account.

### US-003 Account recovery
**As a** user  
**I want** to reset my password  
**So that** I can recover access if I forget it

**Acceptance criteria**
- The system generates a temporary reset token.
- The system invalidates the token after use or expiration.
- The new password securely replaces the previous one.

### US-004 Passkey verification
**As a** security-conscious user  
**I want** to register a passkey  
**So that** I can improve authentication and reduce takeover risk

**Acceptance criteria**
- The system generates a temporary challenge.
- The system stores a WebAuthn credential associated with the user.
- The user can sign in with a passkey when the feature is enabled in the interface.

---

## 3.2 Profile

### US-005 Profile editing
**As a** user  
**I want** to edit my public profile  
**So that** I can show identity and context

**Acceptance criteria**
- I can edit `fullName`, `bio`, `website`, and `location`.
- I can change `username` according to product rules.
- I can upload an avatar and its optimized variants.
- The profile remains decoupled from credentials.

### US-006 Profile privacy
**As a** user  
**I want** to mark my profile as private  
**So that** I can control who sees my content

**Acceptance criteria**
- A private profile requires an accepted follow.
- Follow requests use the same `Follow` model with status.
- The UI clearly shows whether a relationship is pending or accepted.

---

## 3.3 Posts and frames

### US-007 Create post
**As a** user  
**I want** to publish text and media  
**So that** I can share content with my audience

**Acceptance criteria**
- I can create a post with an optional caption.
- I can attach multiple ordered media pieces.
- I can define location and visibility.
- I can hide likes or disable comments.
- I can associate audio if the product enables it in the UI.

### US-008 Create frame
**As a** creator  
**I want** to publish a frame  
**So that** I can distribute short-form content within the same publishing core

**Acceptance criteria**
- The frame is modeled as `Post.type = FRAME`.
- The flow reuses the media, hashtags, caption, and visibility system.
- There is no separate data entity for frame.

### US-009 Tag users and hashtags
**As a** user  
**I want** to tag accounts and associate hashtags  
**So that** I can increase context and discovery

**Acceptance criteria**
- I can associate hashtags with the post.
- I can tag users at coordinates on the content.
- The system persists tags and hashtags as specific relations.

### US-010 Interact with posts
**As a** user  
**I want** to like, comment on, and save posts  
**So that** I can participate and return to relevant content

**Acceptance criteria**
- The like is recorded in a post-specific table.
- Comments support nested replies.
- Saving is recorded as a bookmark.
- The bookmark can be associated with a collection.

---

## 3.4 Stories

### US-011 Create story
**As a** user  
**I want** to publish an ephemeral story  
**So that** I can share temporary moments

**Acceptance criteria**
- The story expires after 24h or according to product rules.
- It can include image or video.
- It can associate audio.
- It can be close friends only.

### US-012 View and react to stories
**As a** user  
**I want** to view stories and react to them  
**So that** I can interact lightly

**Acceptance criteria**
- The system records `StoryView` per viewer.
- The system records `StoryReaction` per user.
- The UI avoids duplicate reactions if business so decides.

### US-013 Manage highlights
**As a** user  
**I want** to save stories in highlights  
**So that** I can make part of my ephemeral content persistent

**Acceptance criteria**
- I can create a highlight.
- I can add or remove stories from a highlight.
- Highlights belong to the user.

---

## 3.5 Social network

### US-014 Follow accounts
**As a** user  
**I want** to follow other accounts  
**So that** I can see their content in my social experience

**Acceptance criteria**
- If the profile is public, the follow may be accepted automatically.
- If the profile is private, the relationship remains `PENDING` until approval.
- The system prevents duplicates.

### US-015 Block accounts
**As a** user  
**I want** to block another account  
**So that** I can protect my experience and safety

**Acceptance criteria**
- The block is persisted.
- The system prevents duplicate blocks.
- Product logic limits visibility and interaction between both parties.

### US-015b Mute accounts
**As a** user  
**I want** to mute another account without unfollowing or blocking  
**So that** I can quietly reduce their content in my feed

**Acceptance criteria**
- The mute is persisted in `Mute` (`muterId`, `mutedId`).
- Muted accounts' posts are excluded from `/feed/foryou` and `/feed/following` for the muter.
- I can mute/unmute from profile and post menus (`/users/:username/follow/mute`, `/follow/unmute`) and view my muted list (`/users/me/follow/muted`).
- Muting is unilateral and does not notify the muted account.

### US-016 Receive notifications
**As a** user  
**I want** to receive relevant notifications  
**So that** I can stay informed of social and operational activity

**Acceptance criteria**
- The system generates notifications for events compatible with the model.
- I can mark notifications as read.
- Notifications support a sender and, optionally, a post reference.

---

## 3.6 Messaging

### US-017 Converse via chat
**As a** user  
**I want** to have private or group conversations  
**So that** I can communicate within CircleSfera

**Acceptance criteria**
- I can be part of a conversation.
- I can send text messages.
- I can reply to a previous message.
- The system records read status per participant.

### US-018 Share content in chat
**As a** user  
**I want** to share posts or stories via message  
**So that** I can recommend content without leaving the product

**Acceptance criteria**
- A message can reference a `postId` or `storyId`.
- The conversation still works even if the message has no text.
- The UI renders a preview according to permissions and content existence.

### US-019 React to messages
**As a** user  
**I want** to react to a message  
**So that** I can respond quickly

**Acceptance criteria**
- A user can have one reaction per message if that is the chosen rule.
- The reaction is persisted in `MessageReaction`.

---

## 3.7 Monetization

### US-020 Subscribe to a plan
**As a** user  
**I want** to purchase a platform plan  
**So that** I can access benefits associated with the tier

**Acceptance criteria**
- I can browse the `PlatformPlan` catalog.
- Signup is executed with Stripe.
- Subscription status is persisted in `PlatformSubscription`.
- Final synchronization depends on a correctly processed webhook.

### US-021 Manage subscription
**As a** user  
**I want** to view or cancel my subscription  
**So that** I can keep control over charges and benefits

**Acceptance criteria**
- I can see the active plan and billing periods.
- I can request cancellation at period end.
- The UI reflects `cancelAtPeriodEnd` and final status.

### US-022 Launch a promotion
**As an** eligible user or creator  
**I want** to promote content  
**So that** I can increase reach in an explicit, paid way

**Acceptance criteria**
- The promotion references `targetType` and `targetId`.
- It has budget, currency, status, and a time window.
- The system validates at application level that the target exists and is promotable.

---

## 3.8 Moderation and operations

### US-023 Report content or account
**As a** user  
**I want** to report a post or an account  
**So that** I can contribute to platform safety

**Acceptance criteria**
- The report includes `targetType`, `targetId`, reason, and optional details.
- The user receives submission confirmation.
- The report is available for operational review.

### US-024 Audit administrative actions
**As an** operator or admin  
**I want** certain actions to be audited  
**So that** I have internal traceability

**Acceptance criteria**
- Actions are recorded in `AdminAuditLog`.
- The log includes actor, action, target, and details.

### US-025 Account verification
**As a** platform  
**I want** to differentiate verification levels  
**So that** I can manage trust, identity, and account types

**Acceptance criteria**
- The user has `verificationLevel` and `accountType`.
- UI and business logic can derive badges or capabilities from those fields.

---

## 3.9 Search and discovery

### US-026 Search users and hashtags
**As a** user  
**I want** to search accounts and topics  
**So that** I can discover relevant content

**Acceptance criteria**
- I can search profiles by username.
- I can search hashtags.
- The system can store the user's search history.

### US-027 Future similarity-based discovery
**As a** product  
**I want** to be able to recommend similar content  
**So that** I can improve discovery without reworking the data model

**Acceptance criteria**
- Posts can have an associated embedding.
- The feature can be enabled later without changing the main model.

### US-028 Privacy and notification settings [NEW]
**As a** user  
**I want** to manage my privacy, content, and notification preferences  
**So that** I have control over my experience and comply with GDPR

**Acceptance criteria**
- I can change my `privacy_level` (public, followers, private).
- I can choose my `content_preference` (general, mature).
- I can enable/disable sensitive content blur.
- I can manage email alerts and push notifications.
- The system persists these changes in `UserSettings`.

---

## 3.10 Live, polls, and Q&A

### US-029 Go live with a co-host
**As a** user  
**I want** to start a live stream and optionally invite a co-host  
**So that** I can broadcast interactively to my audience

**Acceptance criteria**
- A `LiveStream` is created on `POST /live/start` and closed on `POST /live/end`.
- A co-host can be invited, accept, and be removed.
- Viewers can send a gift during the stream (`POST /live/:streamId/gift`); **gifts are a social/UI event only and are not currently billed or ledgered** — no `Transaction` is created.

### US-030 Add a poll or Q&A box to a post or story
**As a** creator  
**I want** to attach a poll or a Q&A box to a post or story  
**So that** I can drive interaction with my audience

**Acceptance criteria**
- A `Poll` or `QnaBox` can be created for exactly one post or story (`POST /interactive/poll`, `POST /interactive/qna`).
- Users can vote once per poll (`PollVote`, unique per user) or submit an answer (`QnaAnswer`).
- The feed hydrates and displays attached polls/QnA boxes.

---

## 3.11 Appeals

### US-031 Appeal a moderation decision
**As a** user  
**I want** to appeal an account ban or a post removal  
**So that** I can request human reconsideration of an enforcement action

**Acceptance criteria**
- The appeal is persisted in `Appeal` with `targetType` (`ACCOUNT_BAN` | `POST_REMOVAL`), `reason`, and `status` (`PENDING` | `APPROVED` | `REJECTED`).
- I can submit an appeal (`POST /appeals`) and see my own appeals (`GET /appeals/my-appeals`) under `Settings → Appeals`.
- An admin can review and resolve appeals (`GET /appeals/admin`, `PATCH /appeals/admin/:id`), and I am notified of the outcome.

---

## 4. Retired or reformulated stories

These stories are no longer official in their previous form:

- Moderation actions as an already implemented table (still no dedicated `ModerationAction` model; see §1).
- Feed preferences persisted as an official resource (still not implemented; see [ADR-0004](./adr/0004-feed-preferences.md)).
- Detailed analytics backed by dedicated tables already available.
- Frames as an independent data entity.

> Note: an earlier revision of this list also included "persisted mute as its own entity" and "persisted appeals as a closed module." Both are now implemented (see US-015b, US-031) and are no longer retired.

---

## 5. Recommended priority

### Immediate priority
- Auth.
- Profile.
- Posts.
- Comments.
- Likes.
- Follows.
- Blocks.
- User Settings (Privacy and GDPR).
- Stories.
- Notifications.
- Billing base.

### Next priority
- Bookmarks and collections.
- Messaging.
- Highlights.
- Search history.
- Promotions.

### Later priority
- Full passkeys UX.
- Embedding-based discovery.
- Advanced admin operations.
