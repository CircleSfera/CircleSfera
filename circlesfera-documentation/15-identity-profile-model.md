# 15 — Identity, Profile, and Username model

**CircleSfera**  
**Version:** 1.0 (Aug 2026)  
**Source of truth:** `circlesfera-backend/prisma/schema.prisma`, JWT strategy, and implemented controllers/services.

This document is the canonical handoff for how **account identity**, **social profile**, **username routing**, and **admin response shapes** work in CircleSfera. When other docs disagree on FK columns or public handles, prefer this file + schema.

Related ADRs: [0013 Admin Identity](./adr/0013-admin-panel-admin-identity.md), [0015 User/Profile split](./adr/0015-user-profile-identity-split.md).

---

## 1. Three identity layers

| Layer | Prisma model | Purpose | Public handle |
| --- | --- | --- | --- |
| **Platform account** | `User` | Credentials, email, Stripe, platform plans, abuse/trust, account lifecycle | Email (private) |
| **Social profile** | `Profile` | Username, avatar, bio, all social graph and content ownership | `@username` |
| **Admin operator** | `AdminIdentity` | Admin Panel login, RBAC, MFA, audit trail | Operator email (admin host only) |

These are **not interchangeable**:

- End users authenticate as `User`; the active session also resolves a **primary** `Profile` (`profileId` in JWT context).
- Social URLs, feeds, chat, likes, follows, and content rows reference **`Profile.id`**, not `User.id`.
- Staff use **`AdminIdentity`** on `admin.circlesfera.com`; platform `User.role` does **not** grant admin-panel access ([ADR-0013](./adr/0013-admin-panel-admin-identity.md)).

---

## 2. What lives on `User` vs `Profile`

### `User` (account-scoped)

- Email, password hash, refresh tokens, passkeys, 2FA secrets
- `role`, `verificationLevel`, `accountType`, KYC / Stripe Identity
- Stripe customer + Connect account IDs
- Root ban (`isRootBanned`), soft-delete (`deletedAt`, `scheduledDeletionAt`)
- `UserSettings` (privacy level, notifications, content preference)
- Platform billing: `PlatformSubscription`, `Promotion`, `Monetization`, `Transaction` sender/receiver, unlock rows, `LiveGift` sender/receiver
- `Appeal`, `DataExportRequest`, `PushSubscription`, `DeviceSignal`
- Optional `linkedAdminIdentities` (correlation only — never used for platform auth)

### `Profile` (social-scoped)

- **`username`** (globally unique), `fullName`, `bio`, avatar/cover + optimized variants
- Profile-level moderation: `isAccountBanned`, `accountBanReason`, `suspendedUntil`
- All **content and social relations**: posts, stories, comments, likes, follows, blocks, mutes, bookmarks, collections, notifications, chat participants/messages, live stream host/co-host, poll votes, QnA answers, reports as reporter, search history, close friends, highlights, edit projects

### Rule of thumb

| Question | Answer |
| --- | --- |
| Who owns this post? | `Post.profileId` → `Profile` |
| Who pays for a platform plan? | `PlatformSubscription.userId` → `User` |
| Who sent this DM? | `Message.senderId` → `Profile` |
| Who filed this report? | `Report.reporterId` → `Profile` |
| Who claimed this report in Admin? | `Report.assignedAdminId` → `AdminIdentity` |
| What appears in the URL? | `Profile.username` |

---

## 3. Username

- **Canonical field:** `Profile.username` (unique index on `profiles.username`).
- **There is no `User.username`.** Legacy docs or UI that assume username on `User` are wrong.
- **Availability check:** `GET /profiles/check-username/:username`
- **Public profile by handle:** `GET /profiles/:username`
- **Own profile (session):** `GET /profiles/me` — uses JWT `profileId`, not email.
- **Frontend routes** typically use `/:username` for public profile pages; API uses the `/profiles` prefix.

Multi-profile accounts: schema allows `User.profiles[]` (FK `Profile.userId`, not unique). Product v1 resolves **one primary profile** per account at login (`findFirst` by `userId` in `JwtStrategy`). API helpers that flatten `profiles[0]` assume this until multi-profile switching ships.

---

## 4. Session and JWT

Platform browser auth uses HTTP-only cookies ([ADR-0007](./adr/0007-auth-cookies-csrf.md)). After validation, controllers receive `CurrentUserData`:

```typescript
interface CurrentUserData {
  userId: string;    // User.id (JWT payload `sub`)
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  profileId: string; // Primary Profile.id for this account
}
```

Implementation: `circlesfera-backend/src/auth/strategies/jwt.strategy.ts`, `current-user.decorator.ts`.

**Guards:**

- `@CurrentUser()` — full account context.
- `@CurrentProfileId()` — shorthand for `request.user.profileId`.
- `OwnershipGuard` — compares resource owner field to **`profileId`** by default (`userIdField` override exists for account-scoped resources).

**Suspension / ban:**

- Root ban: `User.isRootBanned` → rejected at JWT validate.
- Temporary suspension: `Profile.suspendedUntil` → rejected at JWT validate.
- Profile ban flags affect visibility/moderation in services; account deletion is on `User`.

Admin Panel uses a **separate** JWT (`aud=circlesfera-admin`) bound to `AdminIdentity`, not `CurrentUserData`.

---

## 5. API response shapes (consumer)

Public and authenticated social APIs generally embed profile snippets inline, for example:

```json
{
  "id": "…",
  "username": "handle",
  "fullName": "…",
  "avatar": "…"
}
```

Exact field sets vary by endpoint (feed hydration, chat, notifications). IDs in content payloads are usually **`profileId`** when referring to authors, likers, or participants.

**Account-only endpoints** (`/users/me/settings`, GDPR export, `/payments/*`, `/monetization/connect`) operate on `User` and may include nested profile data for display but mutate account or billing fields.

---

## 6. Admin Panel response contract

Admin list/detail UIs expect a **legacy-compatible** nested shape for human-readable handles:

```json
{
  "user": {
    "id": "…",
    "email": "…",
    "profile": {
      "username": "handle",
      "avatar": "…",
      "fullName": "…"
    }
  }
}
```

Backend mapping helpers (`circlesfera-backend/src/common/utils/user-profile-shape.util.ts`):

| Helper | When to use |
| --- | --- |
| `toAdminUser(profile)` | Row already **is** a `Profile` (or profile join) — e.g. comment author, report reporter, live host |
| `withPrimaryProfile(user)` | Row is **`User` with `profiles[]`** — e.g. admin user list, transaction party |

**Do not** expose raw Prisma `profiles[]` arrays to admin React tabs; flatten to `user.profile`.

**Live streams:** host/co-host map to `{ id, profile: { username, avatar } }` where `id` is the profile id.

**Reports:** `reporter` is a `Profile` in the database; admin JSON uses `reporter.profile.username` via `toAdminUser`.

---

## 7. Prisma FK cheat sheet (social vs account)

Use **`profileId`** (or `*Id` → `profiles.id`) for:

`posts`, `stories`, `comments`, `likes`, `comment_likes`, `bookmarks`, `collections`, `follows`, `blocks`, `mutes`, `close_friends`, `notifications`, `participants`, `messages`, `message_reactions`, `story_views.viewerId`, `story_reactions`, `highlights`, `poll_votes`, `qna_answers`, `search_history`, `edit_projects`, `live_streams.hostId` / `coHostId`, `reports.reporterId`.

Use **`userId`** (→ `users.id`) for:

`refresh_tokens`, `passkeys`, `user_settings`, `platform_subscriptions`, `promotions`, `monetization`, `transactions`, `appeals`, `live_gifts` sender/receiver, `post_unlocks`, `story_unlocks`, `message_unlocks`, `data_export_requests`, `push_subscriptions`, `device_signals`.

Use **`adminId`** (→ `admin_identities.id`) for:

`admin_audit_logs`, `admin_refresh_tokens`, `admin_passkeys`, `reports.assignedAdminId`.

See [02-database-er-diagram.md](./02-database-er-diagram.md) §2–12 for table-level detail.

---

## 8. Verification and product tiers

- **`User.verificationLevel`** and **`User.accountType`** gate monetization and plan features (`IdentityVerifiedGuard`, `SubscriptionGuard`).
- **Verified badge** and public creator signals are derived from account/plan state and mapped onto profile responses in services — not a separate username table.
- **Privacy:** `UserSettings.privacyLevel` on the account; exposed to clients as profile visibility where mapped (`isPrivate`).

---

## 9. Regression guard: profile drift smoke

After User/Profile refactors, run against a running API (Docker default `http://localhost:8080/api/v1`):

```bash
npm run smoke:profile-drift
```

Script: `scripts/validate-profile-drift-smoke.mjs`. Checks admin and public endpoints return `user.profile.username` (or equivalent) instead of broken `@usuario` placeholders or 500s from invalid Prisma selects (`sender.profile` on wrong model, etc.).

---

## 10. Doc maintenance

When adding a new social feature:

1. Decide owner: almost always `Profile`.
2. Decide billing/trust owner: usually `User` or `AdminIdentity`.
3. Update admin serializers if the UI shows a handle.
4. Extend smoke script if the endpoint is admin-critical.

When this document conflicts with `schema.prisma`, **schema wins** — file a doc fix.
