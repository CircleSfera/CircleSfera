# Domain Authorization Policy Matrix

## Overview & Purpose

CircleSfera enforces a strict, defense-in-depth authorization model across all domain resources. Rather than relying on monolithic role-based access or client-side trust, authorization in CircleSfera evaluates five orthogonal dimensions for every incoming request:

1. **Actor**: Who is invoking the operation (Anonymous, Authenticated User, Identity-Verified User, Platform Subscriber, Staff Operator, Super Admin).
2. **Relationship**: How the actor relates to the resource owner or participants (Self/Owner, Follower, Mutual Follower, Close Friend, Conversation Member, Stream Host, Co-host, Blocked, Muted).
3. **Role & Staff Scope**: Specific cryptographic or administrative permission flags (`AdminPermission.key`) granted to operators within the Admin Identity realm.
4. **Entitlement**: Transactional unlocks and subscription status (`PostUnlock`, `StoryUnlock`, `MessageUnlock`, active `PlatformPlan`, Stripe Connect capability).
5. **Lifecycle State**: Account standing and temporality (`isActive`, `emailVerified`, `identityVerifiedAt`, 30-day scheduled deletion grace period, `isBanned`, `expiresAt > now()`).

This document constitutes the canonical source of truth for domain access control and satisfies the requirements of **Section 145 / AUTHZ-001**.

---

## Defense-in-Depth Architecture

Authorization is enforced sequentially through four architectural layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 1: Master Proxy (Nginx)                                           │
│ - Internal subrequest /internal/media-auth for static uploads           │
│ - Cross-Site WebSocket Hijacking (CSWSH) origin verification            │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 2: HTTP Route Guards (NestJS)                                     │
│ - JwtAuthGuard / JwtOptionalGuard / AdminJwtAuthGuard                   │
│ - EmailVerifiedGuard (Turnstile rate-limiting)                          │
│ - IdentityVerifiedGuard (Stripe Identity session verification)          │
│ - SubscriptionGuard (RequiresPlan tier pricing check)                   │
│ - AdminGuard (StaffPermission verification with step-up MFA)            │
│ - OwnershipGuard (Generic declarative pre-execution resource ownership) │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3: Application Services & Use-Cases                               │
│ - Identity split enforcement (User ID vs Profile ID per ADR-0015)       │
│ - Scoped relational queries (where: { id, profileId: user.profileId }) │
│ - In-memory boundary validation (conversation participant, co-host)     │
│ - Mutual block isolation (Block / Mute compound checks)                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Relational & Transactional Concurrency                         │
│ - PostgreSQL unique compound indexes (e.g., followerId_followingId)     │
│ - ACID transactions ($transaction) with optimistic webhook leasing      │
│ - Cascade deletion rules and immutable audit log retention              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Policy Taxonomy

### 1. Actor Hierarchy
- **`ANONYMOUS`**: Unauthenticated guest visitor.
- **`USER`**: Authenticated consumer (`User` credentials + active session cookie).
- **`CREATOR` / `BUSINESS`**: User possessing creator capabilities, analytics, or Stripe Connect integrations.
- **`IDENTITY_VERIFIED`**: User with verified government ID via Stripe Identity (`identityVerifiedAt != null`).
- **`SUBSCRIBER`**: User with active `PlatformSubscription` at a designated tier (`priceCents >= requiredTierPriceCents`).
- **`OPERATOR`**: Administrative staff member authenticated via `AdminJwtAuthGuard` carrying granular `StaffPermission` keys.
- **`SUPER_ADMIN`**: Unrestricted operator possessing `admins.manage` permission or `SUPER_ADMIN` role bypass.

### 2. Relationship Dimensions
- **`SELF` / `OWNER`**: Actor identity matches resource owner (`User.id == resource.userId` or `Profile.id == resource.profileId`).
- **`FOLLOWER`**: Actor possesses an `ACCEPTED` `Follow` record where `followerId == actorProfileId && followingId == ownerProfileId`.
- **`MUTUAL_FOLLOW`**: Both profiles possess mutual accepted `Follow` records.
- **`CLOSE_FRIEND`**: Actor is recorded in `CloseFriend` table where `profileId == ownerProfileId && friendId == actorProfileId`.
- **`CONVERSATION_PARTICIPANT`**: Actor is an active member of the `Conversation` (`participants` relation).
- **`STREAM_HOST`**: Actor is the creator profile that initiated the live stream.
- **`CO_HOST`**: Actor profile accepted an active co-host invitation for the stream.
- **`BLOCKED`**: Either actor has blocked the other in the `Block` table (results in complete mutual read/write invisibility).
- **`MUTED`**: Actor is silenced by the user in the `Mute` table (feed and notification suppression).

### 3. Staff Permission Scopes (`AdminPermission.key`)
- `reports`: Read and resolve content/user moderation reports.
- `appeals`: Review and determine user account/content appeals.
- `moderation`: Access automated and queued content moderation.
- `users.read`: View user profile directories and account status.
- `users.write`: Modify non-destructive user profile records.
- `users.ban`: Apply or lift administrative account suspensions/bans.
- `payments`: Inspect global financial ledger and platform revenue.
- `system`: Manage platform runtime parameters and system settings.
- `experiments`: Configure A/B feature flags and rollouts.
- `support`: Manage and reply to customer support tickets.
- `audit`: Review immutable security and administrative audit logs.
- `live`: Monitor and force-terminate live streams.
- `content`: Administratively delete arbitrary posts, comments, or stories.
- `admins.manage`: Create, configure, or revoke operator accounts and permissions.

### 4. Monetization Entitlements
- **`PostUnlock`**: Active purchase record (`userId_postId`) enabling viewer access to premium pay-per-view post media.
- **`StoryUnlock`**: Active purchase record (`userId_storyId`) enabling viewer access to pay-per-view story media.
- **`MessageUnlock`**: Active purchase record (`userId_messageId`) enabling viewer access to locked pay-per-view direct messages.
- **`PlatformPlan`**: Active `PlatformSubscription` meeting or exceeding minimum price rank (e.g. Free, Pro, Elite Creator).
- **`StripeConnect`**: Connected Stripe account with `charges_enabled == true` and `payouts_enabled == true`.

### 5. Lifecycle States
- **`ACTIVE`**: User account is valid, not deactivated, and not soft-deleted (`isActive == true`).
- **`EMAIL_VERIFIED`**: User has completed email verification token exchange (`emailVerified != null`).
- **`IDENTITY_VERIFIED`**: User has satisfied KYC requirements via Stripe Identity session.
- **`SCHEDULED_DELETION`**: Account is undergoing 30-day GDPR deletion grace period (`isActive == false`, `scheduledDeletionAt != null`). Authenticated mutations are blocked; login initiates auto-restoration.
- **`BANNED`**: Account is administratively suspended (`isBanned == true`). All sessions revoked; login blocked.
- **`EPHEMERAL_VALID`**: Resource has not passed expiration timestamp (`expiresAt > now()`).

---

## Canonical 15-Domain Authorization Matrix

| # | Domain | Resource Action | HTTP Method & Route | Actor | Relationship | Staff Role / Permission | Entitlement | Lifecycle State | Enforcement Mechanism |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **Posts** | Create Post | `POST /posts` | `USER` | None | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | List Feed / Discover | `GET /posts`, `GET /posts/frames` | `ANONYMOUS`, `USER` | Public / Follower | None | None | None | `JwtOptionalGuard`, Service un-gated query |
| | | View Single Post | `GET /posts/:id` | `ANONYMOUS`, `USER` | Public / Follower / Owner | None | `PostUnlock` (if PPV) | `EPHEMERAL_VALID` (media) | `JwtOptionalGuard`, Service PPV redaction |
| | | Update Post | `PUT /posts/:id` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `OwnershipGuard('Post')` |
| | | Delete Post (Owner) | `DELETE /posts/:id` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `OwnershipGuard('Post')` |
| | | Delete Post (Admin) | `DELETE /posts/:id/admin` | `OPERATOR` | Any | `content` | None | None | `AdminJwtAuthGuard`, `AdminGuard('content')` |
| **2** | **Comments** | Create Comment | `POST /posts/:postId/comments` | `USER` | Follower / Public (not blocked) | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | List Post Comments | `GET /posts/:postId/comments` | `ANONYMOUS`, `USER` | Public / Follower | None | None | None | `JwtOptionalGuard`, ModerationStatus query |
| | | Delete Comment | `DELETE /posts/:postId/comments/:id` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { id, profileId }` |
| | | Like / Unlike Comment | `POST`, `DELETE .../comments/:id/like` | `USER` | Not blocked | None | None | `ACTIVE` | `JwtAuthGuard`, Unique `CommentLike` record |
| **3** | **Stories** | Create Story | `POST /stories` | `USER` | None | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | List Followed Stories | `GET /stories` | `USER` | `FOLLOWER`, `CLOSE_FRIEND` (if CF) | None | `StoryUnlock` (if PPV) | `EPHEMERAL_VALID` | `JwtOptionalGuard`, Service CF check |
| | | View Archive | `GET /stories/archive` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { profileId }` |
| | | Record View | `POST /stories/:id/view` | `USER` | Follower / Viewer | None | None | `ACTIVE` | `JwtAuthGuard`, `StoryView` upsert |
| | | Get Story Viewers | `GET /stories/:id/views` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { storyId, profileId }` |
| | | Delete Story | `DELETE /stories/:id` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { id, profileId }` |
| | | Manage Highlights | `POST`, `PATCH`, `DELETE /highlights` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `OwnershipGuard('Highlight')` |
| **4** | **Profiles & Users** | View Public Profile | `GET /profiles/:username` | `ANONYMOUS`, `USER` | Public / Not blocked | None | None | `ACTIVE` | Open / Privacy level filtering |
| | | View Own Profile | `GET /profiles/me` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `user.profileId` scoping |
| | | Update Own Profile | `PUT /profiles/me` | `USER` | `SELF` | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | Update User Settings | `PUT /users/me/settings` | `USER` | `SELF` | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | Schedule Deletion | `DELETE /users/me` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, 30-day grace transition |
| | | Restore Account | `POST /users/me/restore` | `USER` | `SELF` | None | None | `SCHEDULED_DELETION` | `JwtAuthGuard`, Re-activation transition |
| | | Ban / Unban User | `PATCH /users/:id/ban`, `unban` | `OPERATOR` | Any | `users.ban` | None | None | `AdminJwtAuthGuard`, `AdminGuard('users.ban')` |
| **5** | **Media & Uploads** | Media Nginx Auth-Check | `GET /media/auth-check` | Any | Decision Matrix | None | `PostUnlock` (if PPV) | Non-expired | Subrequest, `MediaAuthService.isAccessAllowed` |
| | | Presign / Finalize Upload | `POST /uploads/presign`, `finalize` | `USER` | `SELF` | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, Quota validation |
| | | Stream GDPR Archive | `GET /users/gdpr/exports/:id/download` | `USER` | `SELF` | None | Cryptographic HMAC | `ACTIVE` | `JwtOptionalGuard`, Signed token verification |
| **6** | **Chat & DMs** | List Conversations | `GET /chat/conversations` | `USER` | `CONVERSATION_PARTICIPANT` | None | None | `ACTIVE` | `JwtAuthGuard`, Participant array inclusion |
| | | Send Message | `POST /chat/messages` | `USER` | Not blocked by recipient | None | `MessageUnlock` (if PPV) | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | Edit / Delete Message | `PUT`, `DELETE /chat/messages/:id` | `USER` | Message Author | None | None | `ACTIVE` | `JwtAuthGuard`, `senderId == profileId` |
| | | Group Administration | `DELETE /chat/conversations/:id/participants/:pId` | `USER` | Group Admin | None | None | `ACTIVE` | `JwtAuthGuard`, Admin participant check |
| **7** | **Live & WebRTC** | Start Live Stream | `POST /live/start` | `USER` | None | None | None | `ACTIVE`, `EMAIL_VERIFIED` | `JwtAuthGuard`, `EmailVerifiedGuard` |
| | | Terminate Live Stream | `POST /live/end` | `USER` | `STREAM_HOST` | None | None | `ACTIVE` | `JwtAuthGuard`, Host profileId validation |
| | | Join Live Stream | `GET /live/join/:streamId` | `USER` | Viewer (not blocked) | None | None | `ACTIVE` | `JwtAuthGuard`, LiveKit token generation |
| | | Co-host Invite / Accept | `POST /live/:streamId/cohost/...` | `USER` | Host / Invited Peer | None | None | `ACTIVE` | `JwtAuthGuard`, Co-host state machine |
| | | Send Live Gift | `POST /live/:streamId/gift` | `USER` | Viewer | None | Monetization Balance | `ACTIVE`, `IDENTITY_VERIFIED` | `JwtAuthGuard`, `IdentityVerifiedGuard` |
| | | WebRTC Signaling | Socket Events (`call-user`, `answer`) | `USER` | Room Participant | None | None | `ACTIVE` | Socket authentication, Room membership |
| **8** | **PPV & Monetization** | Unlock Post / Story / Msg | `POST /monetization/unlock*` | `USER` | Non-author | None | Stripe Checkout | `ACTIVE`, `IDENTITY_VERIFIED` | `JwtAuthGuard`, `IdentityVerifiedGuard` |
| | | Send Tip | `POST /monetization/tip` | `USER` | Non-self (`sender != receiver`) | None | Stripe Checkout | `ACTIVE`, `IDENTITY_VERIFIED` | `JwtAuthGuard`, `IdentityVerifiedGuard` |
| | | Stripe Connect Onboard | `POST /monetization/connect` | `USER` | `SELF` | None | None | `ACTIVE`, `IDENTITY_VERIFIED` | `JwtAuthGuard`, `IdentityVerifiedGuard` |
| | | View Financial Summary | `GET /monetization/analytics/*` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, Scoped by `user.userId` |
| **9** | **Promotions & Ads** | Create Promotion | `POST /creator/promotions` | `USER` | `OWNER` | None | `Elite Creator` Plan | `ACTIVE` | `JwtAuthGuard`, `SubscriptionGuard` |
| | | Manage / Pause / Cancel | `POST`, `PATCH`, `DELETE /creator/promotions/:id` | `USER` | `OWNER` | None | `Elite Creator` Plan | `ACTIVE` | `JwtAuthGuard`, `SubscriptionGuard` |
| | | Record Impression / Click | `POST /creator/promotions/:id/view` | Any | None | None | None | None | Rate-limited public recording |
| **10** | **Creator Capabilities** | Advanced Audience Analytics | `GET /creator/stats`, `/activity-chart` | `USER` | `SELF` | None | `Elite Creator` Plan | `ACTIVE` | `JwtAuthGuard`, `SubscriptionGuard` |
| | | Export Analytics CSV | `GET /creator/analytics/export` | `USER` | `SELF` | None | `Elite Creator` Plan | `ACTIVE` | `JwtAuthGuard`, `SubscriptionGuard` |
| **11** | **Payments & Billing** | Create Plan Checkout | `POST /payments/checkout` | `USER` | `SELF` | None | None | `ACTIVE`, `IDENTITY_VERIFIED` | `JwtAuthGuard`, `IdentityVerifiedGuard` |
| | | Access Customer Portal | `GET /payments/portal` | `USER` | `SELF` | None | Stripe Customer | `ACTIVE` | `JwtAuthGuard`, Scoped by `user.userId` |
| | | Download User Ledger | `GET /payments/ledger` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { userId }` |
| | | Download Admin Ledger | `GET /payments/admin/ledger` | `OPERATOR` | Any | `payments` | None | None | `AdminJwtAuthGuard`, `AdminGuard('payments')` |
| **12** | **Notifications** | List Notifications | `GET /notifications` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { recipientId }` |
| | | Mark Notification Read | `PUT /notifications/:id/read` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { id, recipientId }` |
| | | Mark All Read | `PUT /notifications/read-all` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { recipientId }` |
| **13** | **Reports & Moderation** | File Report | `POST /reports` | `USER` | Reporter | None | None | `ACTIVE` | `JwtAuthGuard`, `reporterId` binding |
| | | View My Reports | `GET /reports/me` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { reporterId }` |
| | | List All Reports (Admin) | `GET /reports` | `OPERATOR` | Any | `reports` | None | None | `AdminJwtAuthGuard`, `AdminGuard('reports')` |
| | | Update Report Status | `PATCH /reports/:id` | `OPERATOR` | Any | `reports` | None | None | `AdminJwtAuthGuard`, `AdminGuard('reports')` |
| **14** | **Appeals** | File Appeal | `POST /appeals` | `USER` | Self / Account Owner | None | Signed Appeal Token | Any (even banned) | `JwtOptionalGuard`, Token verification |
| | | View My Appeals | `GET /appeals/my-appeals` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { userId }` |
| | | List All Appeals (Admin) | `GET /appeals/admin` | `OPERATOR` | Any | `appeals` | None | None | `AdminJwtAuthGuard`, `AdminGuard('appeals')` |
| | | Resolve Appeal | `PATCH /appeals/admin/:id` | `OPERATOR` | Any | `appeals` | None | None | `AdminJwtAuthGuard`, `AdminGuard('appeals')` |
| **15** | **Collections & Bookmarks** | Collection CRUD | `POST`, `GET`, `PATCH`, `DELETE /collections` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, `OwnershipGuard('Collection')` |
| | | Toggle Bookmark | `POST /bookmarks/:postId` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { profileId, postId }` |
| | | Move Bookmark | `PATCH /bookmarks/:postId/collection` | `USER` | `OWNER` | None | None | `ACTIVE` | `JwtAuthGuard`, Ownership of collection |
| | | List Bookmarks | `GET /bookmarks` | `USER` | `SELF` | None | None | `ACTIVE` | `JwtAuthGuard`, `where: { profileId }` |

---

## Verification & Automated Testing

The authorization matrix policies are mechanically enforced and continuously regression-tested by the following automated suites:

1. **Domain Authorization Matrix Suite** (`src/common/testing/domain-authorization-matrix.spec.ts`):
   - 36 dedicated invariant tests evaluating access denial, IDOR prevention, permission checks, and plan gating across all 15 domains.
2. **Resource Ownership Guard Suite** (`src/auth/guards/ownership.guard.spec.ts`):
   - 12 unit tests validating pre-execution declarative ownership enforcement for Post, Comment, Story, Highlight, Notification (`recipientId`), Collection (`profileId`), DataExportRequest, SupportTicket, Profile, and User.
3. **Lifecycle & Deletion Invariant Suite** (`src/common/testing/lifecycle-authorization.spec.ts`):
   - 10 integration invariant tests validating 30-day scheduled deletion grace periods, account deactivation boundaries, login auto-restoration, and comment IDOR isolation.
4. **Security Regression Suite** (`src/common/testing/security-regression.spec.ts`):
   - 27 unit and integration tests verifying fail-closed password checks, JWT secrets, WebRTC signaling room isolation, PPV media access control, and GDPR HMAC token gating.
5. **Root E2E Authorization Suite** (`test/security/authorization.security.e2e-spec.ts`):
   - Live HTTP integration tests asserting cross-user cookie isolation, CSRF validation, post/comment IDOR blocks, and administrative endpoint lockdown.
