# CircleSfera: Product Requirements & User Stories

> **Source of Truth:** `circlesfera-backend/prisma/schema.prisma` and implemented NestJS/React code.
> This document defines the functional requirements, epics, and acceptance criteria across CircleSfera.
> Present tense reflects shipped production behavior. Refer to [00-status.md](./00-status.md).

---

## 1. Product Scope & Functional Architecture

CircleSfera is a production-grade, mobile-first social platform designed with strict domain decoupling:
- **Decoupled Identity Model**: Credentials, billing, and security settings are anchored to `User`, while all public presentations and social interactions are anchored to `Profile` ([ADR-0015](./adr/0015-user-profile-identity-split.md)).
- **Rich Media & Content Formats**: Standard posts, vertical frames, multi-asset carousels, 24-hour ephemeral stories, close friends privacy layers, and profile highlights.
- **Fair Creator Monetization**: Transparent platform plans, direct pay-per-view post unlocks, live stream gifting, and automated creator payouts with an immutable 20% platform fee ([ADR-0010](./adr/0010-platform-fee-20-percent.md)).
- **Trust, Safety & Moderation**: User-driven reporting, structured appeals, granular Admin Panel RBAC with mandatory MFA ([ADR-0013](./adr/0013-admin-panel-admin-identity.md)), and audit logging.

---

## 2. Production Epics

### EPIC-1: Identity and Access
Registration, authentication, JWT rotation via `httpOnly` cookies, password recovery, email verification, and WebAuthn Passkeys.

### EPIC-2: Profile and Social Persona
Profile management, public handles (`Profile.username`), avatars, biography, privacy preferences (`UserSettings`), and status indicators.

### EPIC-3: Content Publishing and Creation
Posts and frames (`PostType`), image and video processing, hashtags, user mentions, comments, and likes.

### EPIC-4: Ephemeral Content and Stories
24-hour expiring stories, viewer tracking, emoji reactions, close friends audience gating, and curated highlights.

### EPIC-5: Social Graph and Interaction
Follow relationships, user blocking, timed mutes, bookmarks, private collections, and real-time notifications.

### EPIC-6: Real-Time Messaging and Direct
One-on-one and group messaging, rich text messages, media sharing, replies, and reactions.

### EPIC-7: Platform Monetization and Billing
Platform subscription tiers, Stripe billing, promotions, pay-per-view post unlocks, and creator payouts.

### EPIC-8: Trust, Safety, and Moderation
Content and profile reporting, structured appeals, operator RBAC with MFA, account suspensions, and administrative audit trails.

### EPIC-9: Lifecycle and Compliance
Scheduled account deletion grace periods (`scheduledDeletionAt`), automated GDPR data exports, and cookie consent enforcement.

### EPIC-10: Search and Discovery
Handle and hashtag discovery, search history with GDPR expiration, and vector-based semantic recommendations (`pgvector`).

### EPIC-11: Live Streaming and Interactive Media
Live broadcasts with co-hosts, virtual live gifting with Stripe billing, and interactive polls and Q&A boxes.

---

## 3. User Stories & Acceptance Criteria

### 3.1 Authentication & Access

#### US-001 Registration
**As a** visitor  
**I want** to create an account with email, password, and unique handle  
**So that** I can access the platform

**Acceptance criteria**
- Validates email format and uniqueness.
- Validates handle format and uniqueness on `Profile`.
- Creates atomic `User` and primary `Profile` entities adhering to ADR-0015.
- Dispatches email verification challenge.
- Passwords are securely hashed with Argon2id.

#### US-002 Login
**As a** registered user  
**I want** to sign in using my email/username and password  
**So that** I can access my account

**Acceptance criteria**
- Authenticates credentials against `User`.
- Issues secure, `httpOnly`, `SameSite=Lax` JWT access and refresh cookies.
- Rotates refresh tokens on session refresh.
- Enforces account lockout on repeated failed attempts.

#### US-003 Account Recovery
**As a** user who forgot their password  
**I want** to request a reset link to my verified email  
**So that** I can regain account access

**Acceptance criteria**
- Generates a cryptographically secure, time-limited reset token in `User.resetToken`.
- Dispatches an email with the recovery link.
- Invalidates active refresh tokens upon successful password reset.

#### US-004 Passkey Authentication
**As a** user on a supported device  
**I want** to register and log in with WebAuthn Passkeys  
**So that** I can access my account without entering a password

**Acceptance criteria**
- Issues a challenge payload (`PasskeyChallenge`) tied to the active session.
- Validates the credential public key and signature counter.
- Allows biometric login on future sessions via navigator credentials API.

---

### 3.2 Profiles & Settings

#### US-005 Profile Management
**As an** authenticated user  
**I want** to customize my public handle, display name, bio, and avatar  
**So that** other members can identify me

**Acceptance criteria**
- Updates `Profile.fullName`, `Profile.bio`, `Profile.avatar`, and `Profile.website`.
- Verifies uniqueness if `Profile.username` is changed.
- Validates and optimizes uploaded image dimensions and formats.

#### US-006 Privacy & Notification Preferences
**As a** user  
**I want** to configure my privacy level, sensitive content blur, and alerts  
**So that** I maintain full control over my experience

**Acceptance criteria**
- Toggles `privacyLevel` (`PUBLIC`, `FOLLOWERS`, `PRIVATE`) in `UserSettings`.
- Configures sensitive content blurring (`blurSensitiveContent`).
- Updates email and push notification preferences (`emailNotifications`, `pushNotifications`).

---

### 3.3 Content Publishing & Feed

#### US-007 Publish Post
**As an** authenticated user  
**I want** to share photos and videos with captions and hashtags  
**So that** my followers can view and engage with my content

**Acceptance criteria**
- Uploads one or more media assets (`PostMedia`) with order and filter metadata.
- Automatically parses and associates `#hashtags` via `PostHashtag`.
- Associates post strictly with author's `Profile.id`.
- Fans out to followers' feed cache asynchronously via BullMQ.

#### US-008 Publish Frame
**As a** creator  
**I want** to publish a vertical short-form video as a Frame  
**So that** I can reach audiences in the immersive feed

**Acceptance criteria**
- Creates a `Post` with `type = FRAME`.
- Enforces vertical aspect ratio (9:16) and duration limits ($\le 60$ seconds).
- Displays in the dedicated Frames discovery surface.

#### US-009 Tag Profiles
**As a** publisher  
**I want** to tag other profiles in my post photos  
**So that** viewers can navigate directly to their profiles

**Acceptance criteria**
- Stores normalized coordinates `(x, y)` in `PostTag`.
- Verifies tagged `profileId` exists.
- Generates mention notification for the tagged profile.

#### US-010 Post Engagement (Likes & Comments)
**As an** authenticated user  
**I want** to like and comment on posts  
**So that** I can interact with content creators

**Acceptance criteria**
- Liking toggles an atomic record in `Like` (`profileId`, `postId`).
- Threaded comments reference `parentId` in `Comment`.
- Notifies the post author unless the author is the actor.

---

### 3.4 Stories & Highlights

#### US-011 Create Story
**As a** user  
**I want** to publish an ephemeral photo or video story  
**So that** I can share moments that expire after 24 hours

**Acceptance criteria**
- Sets `Story.expiresAt` to 24 hours from creation.
- Supports audience restriction via `isCloseFriendsOnly`.
- Suppresses expired stories from feed and profile views.

#### US-012 View & React to Stories
**As a** viewer  
**I want** to watch stories and react with emojis  
**So that** the creator knows I engaged

**Acceptance criteria**
- Records unique view events in `StoryView` (`storyId`, `viewerId`).
- Persists emoji reactions in `StoryReaction`.
- Allows the author to inspect real-time viewer lists.

#### US-013 Story Highlights
**As a** creator  
**I want** to save selected expired stories into permanent highlights on my profile  
**So that** new visitors can view my best moments

**Acceptance criteria**
- Groups stories into a `Highlight` record with custom title and cover image.
- Links individual stories via `HighlightStory` join table.
- Renders highlight carousels on the public profile.

---

### 3.5 Social Graph & Privacy

#### US-014 Follow Accounts
**As a** user  
**I want** to follow other profiles  
**So that** their posts appear in my Following feed

**Acceptance criteria**
- Public profiles transition `Follow.status` immediately to `ACCEPTED`.
- Private profiles set `Follow.status` to `PENDING` awaiting manual approval.
- Updates follower/following counts atomically.

#### US-015 Block Accounts
**As a** user  
**I want** to block accounts that I do not wish to interact with  
**So that** they cannot see my profile, posts, or contact me

**Acceptance criteria**
- Creates a `Block` record (`blockerId`, `blockedId`).
- Automatically severs mutual follow relationships.
- Hides content, profiles, and messages reciprocally.

#### US-016 Timed Account Mutes
**As a** user  
**I want** to mute an account for a specific duration (24h, 7d, 30d, permanent)  
**So that** their posts are hidden without unfollowing them

**Acceptance criteria**
- Persists `Mute` record with optional `expiresAt` timestamp.
- Excludes author's content from `FeedService` during active mute window.
- Exposes mute list under `Settings` for unmuting at any time.

#### US-017 Notifications
**As a** user  
**I want** to receive alerts when others interact with my content  
**So that** I stay informed of activity

**Acceptance criteria**
- Emits real-time Socket.io events to connected clients.
- Persists alerts in `Notification` table with read/unread tracking.
- Supports notification filtering by category.

---

### 3.6 Direct Messaging

#### US-018 Private & Group Conversations
**As a** user  
**I want** to start direct chats with one or more profiles  
**So that** I can communicate privately

**Acceptance criteria**
- Creates a `Conversation` and links members via `Participant`.
- Enforces message delivery only to active participants.
- Supports read receipts via `lastReadAt`.

#### US-019 Send Messages & Media
**As a** conversation participant  
**I want** to send text, images, and content links  
**So that** I can share information in real time

**Acceptance criteria**
- Delivers messages via WebSockets with persistent storage in `Message`.
- Supports threaded replies via `replyToId`.
- Supports post and story rich preview embeds.

---

### 3.7 Platform Monetization

#### US-020 Platform Subscriptions
**As a** user  
**I want** to subscribe to a platform tier (e.g. VIP, Pro)  
**So that** I can unlock advanced platform features

**Acceptance criteria**
- Displays server-side pricing catalog from `PlatformPlan`.
- Processes checkout securely via Stripe Customer Portal / Checkout.
- Synchronizes status in `PlatformSubscription` via verified webhooks.

#### US-021 Direct Post Unlocks (Pay-Per-View)
**As a** creator  
**I want** to lock premium posts behind a one-time price  
**So that** followers can purchase access directly

**Acceptance criteria**
- Author sets `priceCents` on post creation.
- Buyer purchases access; creates `PostUnlock` and `Transaction` records.
- Deducts 20% platform fee and credits creator balance ([ADR-0010](./adr/0010-platform-fee-20-percent.md)).

#### US-022 Content Promotions
**As an** eligible creator or business  
**I want** to promote a post with a dedicated budget  
**So that** I can expand my audience reach

**Acceptance criteria**
- Validates budget in integer cents (`budgetCents`).
- Collects payment via Stripe Payment Intent before activating promotion.
- Injects promoted posts into target demographic feeds until budget exhaustion.

---

### 3.8 Live Streaming & Interactivity

#### US-023 Live Streaming with Co-Hosts
**As a** creator  
**I want** to host an interactive live stream and invite co-hosts  
**So that** I can broadcast in real time to my community

**Acceptance criteria**
- Creates a `LiveStream` with WebRTC signaling via LiveKit ([ADR-0005](./adr/0005-livekit-live-streaming.md)).
- Supports co-host invitation, acceptance, and removal.
- Archives stream replay URLs upon stream completion.

#### US-024 Virtual Live Gifts
**As a** viewer  
**I want** to send virtual gifts to a live streamer  
**So that** I can support their broadcast

**Acceptance criteria**
- Processes gift transactions via Stripe Checkout.
- Persists gift events in `LiveGift` and `Transaction`.
- Deducts 20% platform fee and broadcasts celebration animation via WebSockets.

#### US-025 Interactive Polls and Q&A
**As a** publisher  
**I want** to attach interactive polls or Q&A prompts to posts and stories  
**So that** I can gather audience opinions

**Acceptance criteria**
- Attaches `Poll` or `QnaBox` to exactly one post or story.
- Enforces single-vote rule per user in `PollVote`.
- Displays real-time aggregate vote percentages.

---

### 3.9 Trust, Safety & Operations

#### US-026 Report Content or Profile
**As a** community member  
**I want** to report inappropriate content or behavior  
**So that** platform moderators can review and take action

**Acceptance criteria**
- Captures report reason, optional details, and target identifier in `Report`.
- Assigns report to an operator queue in the Admin Panel.
- Masks reporter identity from the reported user.

#### US-027 Moderation Appeals
**As a** penalized user  
**I want** to appeal an account ban or post removal  
**So that** a human operator can reconsider the decision

**Acceptance criteria**
- Submits appeal with reason under `Settings → Appeals`.
- Persists appeal in `Appeal` table (`ACCOUNT_BAN` or `POST_REMOVAL`).
- Operator reviews appeal and renders binding decision (`APPROVED` or `REJECTED`).

#### US-028 Operator Audit Trail
**As a** platform administrator  
**I want** all administrative actions logged with actor details  
**So that** internal security and compliance are assured

**Acceptance criteria**
- Records operator actions in `AdminAuditLog` with IP, timestamp, and target.
- Enforces write-only append immutability on audit records.

---

## 4. Out-of-Scope & Non-Modeled Functional Boundaries

Consistent with [00-status.md](./00-status.md), the following concepts remain strictly outside the production scope:
- **Standalone `ModerationAction` Table**: Operational traceability persists directly via `Report`, `AdminAuditLog`, and `Appeal`.
- **Microservices & Event Sourcing**: Premature service decomposition or generic event buses (`EventEmitter2`) without an approved ADR are prohibited.
- **Client-Side Sensitive State**: JWT storage in `localStorage` is barred; sessions are managed via `httpOnly` secure cookies.
- **GraphQL APIs**: All public and internal APIs are strictly RESTful with lean controllers.
- **Native Mobile Apps**: CircleSfera operates exclusively as a mobile-first responsive web application / PWA.

---

## 5. Development Status & Priorities

### 🟢 Production Shipped
- Core authentication, JWT rotation, passkeys, and identity split (ADR-0015).
- Posts, frames, media attachments, hashtags, likes, comments, bookmarks, and collections.
- Ephemeral stories, close friends, view tracking, and highlights.
- Direct messaging, conversations, and participant management.
- Platform subscription plans, post unlocks, and Stripe Connect webhook synchronization.
- Reporting, appeals, and Admin Panel operator controls.

### 🟡 In Development
- Analytical warehouse integrations (ClickHouse Cloud) per [ADR-0016](./adr/0016-analytical-warehouse-clickhouse.md).
- Advanced semantic similarity search utilizing `pgvector` backfill pipelines.
