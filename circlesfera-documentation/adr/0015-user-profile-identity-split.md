# ADR-0015: User / Profile identity split

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** CircleSfera engineering
- **Scope:** backend | frontend | data | API contracts | admin panel

## Context

Early models conflated **login account** and **public social identity** on a single `User` row (including `username` and avatar). That coupling blocked:

- Separating billing/KYC/abuse state from public profile presentation
- Aligning content FKs with “who appears on the feed” (always a profile)
- Admin Panel operator identity (already split in [ADR-0013](./0013-admin-panel-admin-identity.md)) without overloading `User.role`

Prisma migrations through Jul–Aug 2026 moved social relations and `username` to `Profile`, with content tables using `profileId`. Residual code and docs still referenced `userId` on posts, invalid nested selects (`User.profile`, `Profile.profiles`), and admin UI expecting `user.profile.username`.

## Decision

CircleSfera maintains **two platform identities** for end users:

1. **`User`** — account, credentials, money, trust signals, settings, appeals.
2. **`Profile`** — unique `username`, public presentation, and ownership of all social/content rows.

**Rules:**

| Domain | FK / key |
| --- | --- |
| Posts, stories, comments, likes, follows, blocks, mutes, chat, notifications, live hosts, poll/QnA participation, reports (reporter) | `profileId` → `Profile` |
| Platform subscriptions, promotions, Stripe Connect, transactions, unlocks, live gift payer/payee, GDPR export, appeals | `userId` → `User` |
| Admin moderation assignee, audit actor | `adminId` → `AdminIdentity` |

**Session:** Platform JWT `sub` remains `User.id`. `JwtStrategy` attaches **`profileId`** (primary profile for the account) to `request.user` alongside `userId`.

**Username routing:** Public handle is **`Profile.username`**. Profile APIs live under `/profiles/*`; account APIs under `/users/*`.

**Admin compatibility:** Admin JSON responses flatten profile fields to **`user.profile.{username, avatar, fullName?}`** via shared helpers (`toAdminUser`, `withPrimaryProfile`) so the React admin panel does not branch on Prisma relation shapes.

**Multi-profile:** Schema allows multiple `Profile` rows per `User`; v1 product uses the first profile returned for the account until explicit profile switching exists.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep `username` on `User` | Perpetuates dual meaning of “user” in APIs and FKs |
| Profile-only identity (drop User id from JWT) | Breaks billing, Stripe, and account deletion flows |
| Expose raw `profiles[]` in admin APIs | Frontend tabs already standardized on `user.profile` |
| Rename all API fields to `profileId` in one breaking release | High client blast radius; incremental shim + smoke preferred |

## Consequences

**Accepted costs.** Developers must check whether a feature is account-scoped or profile-scoped before adding FKs or Prisma selects. Admin serializers need explicit mapping. Docs and ERD must list `profileId` on social tables.

**Benefits.** Clear separation of money/trust vs social graph; consistent feed/chat ownership; aligns with AdminIdentity split; enables future multi-profile without rewriting content FKs.

**Validation.** `npm run smoke:profile-drift` against Docker API; backend unit tests for admin/interactive/chat paths.

**Out of scope for this ADR.** Renaming `Transaction.amount` to `amountCents`; shipping profile switcher UI; ABAC on admin permissions.

## Implementation anchors

- `circlesfera-backend/prisma/schema.prisma` — `User`, `Profile`, social models
- `circlesfera-backend/src/auth/strategies/jwt.strategy.ts` — `profileId` resolution
- `circlesfera-backend/src/common/utils/user-profile-shape.util.ts` — admin response shims
- `circlesfera-documentation/15-identity-profile-model.md` — human-readable contract
- `scripts/validate-profile-drift-smoke.mjs` — regression smoke

## Revisiting

Revisit when shipping **multi-profile switching** (JWT must carry active profile id explicitly) or a **versioned public API** that removes `user.profile` nesting in admin-only responses.
