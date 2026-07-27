# Trust and Safety

**Scope.** Moderation, reporting, appeals, account sanctions, visibility limits, staff permissions,
and the transparency obligations attached to all of it.

This is where CircleSfera's differentiating principles are either honoured or quietly broken.

## Read first

- `circlesfera-documentation/07-content-moderation-policy.md`
- [`../core/identity.md`](../core/identity.md) — no hidden suppression, explicit moderation
- `src/reports/`, `src/appeals/`, `src/admin/`
- `src/auth/guards/admin.guard.ts` + `admin.guard.spec.ts` — deny-by-default for moderators
- `schema.prisma`: `Report`, `Appeal`, `ModerationSignature`, `AdminAuditLog`, `Block`, `Mute`,
  and on `User`: `strikeCount`, `suspendedUntil`, `isActive`, `deletedAt`
- `src/ai/` — automated moderation signals

## The model

- **Enums:** `ReportTargetType` (`USER`, `POST`, `COMMENT`, `STORY`, `MESSAGE`), `ReportReason`
  (9 values including `CSAM`), `ReportStatus` (`PENDING`, `REVIEWING`, `RESOLVED`, `REJECTED`),
  `ModerationStatus` (`VISIBLE`, `FLAGGED`, `HIDDEN`, `REMOVED`), `AppealTargetType`
  (`ACCOUNT_BAN`, `POST_REMOVAL`), `AppealStatus`, and `AdminAction` (29 values) for auditing.
- **Shipped behaviour:** report claim → `REVIEWING` → resolution with notes; warn / suspend /
  restore with `suspendedUntil` enforced at login and in the JWT strategy plus a daily lift cron;
  author notification on AI or admin hide and restore; appeals surfaced in Settings with outcome
  notification; a ban response carries an `appealToken`.
- **Staff model:** `Role.MODERATOR` exists and `AdminGuard` denies by default — a moderator route must
  declare `@RequireStaffPermissions`. Every consequential action writes an `AdminAuditLog` row.

## Checks

1. **Is the action explicit and communicable?** The user must be able to learn what happened, why,
   under which rule, and how to contest it. A silent limitation violates the product's core
   commitment.
2. **No hidden suppression.** Any visibility reduction must be represented in `ModerationStatus` or in
   an explicit, documented rule — never an undocumented ranking penalty. If a request asks for a
   silent reach reduction, refuse and escalate.
3. **Appealable.** Sanctions that matter need an appeal path. Check `AppealTargetType` covers the new
   case; if not, that is a product decision.
4. **Audited.** Every staff action writes `AdminAuditLog` with actor, action, target and reason. Pick
   the right `AdminAction` value; adding one is a schema change.
5. **Least privilege.** New admin surfaces declare their required staff permissions. Never widen
   moderator scope implicitly.
6. **Reporter safety.** The reported user must not learn who reported them.
7. **Escalation paths.** `CSAM` and illegal content require an escalation route, not a normal queue
   position. Verify existing handling before changing anything nearby.
8. **User-side controls stay intact.** `Block`, `Mute`, close friends, feed preferences
   (`FeedHiddenPost`, `FeedHiddenAuthor`, `FeedMutedKeyword`) are user control mechanisms — never
   weaken them for engagement.
9. **Automated moderation is a signal, not a verdict.** AI flags should route to review; a fully
   automated irreversible sanction needs an explicit product decision.
10. **Consistency.** The same violation produces the same outcome. Encode that in the code path, not
    in reviewer memory.
11. **Sanction interaction.** Suspended, banned and scheduled-for-deletion accounts must behave
    coherently across auth, feed, chat, payments and notifications.

## Hard rules

- Never implement shadow banning or an undocumented visibility penalty.
- Never apply a sanction without a record, a reason, and a way for the user to find out.
- Never remove an appeal path.
- Never expose reporter identity.
- Never widen staff permissions without an explicit least-privilege justification.
- Never let a moderation feature bypass `AdminGuard` or skip `AdminAuditLog`.
- Changes to moderation behaviour are business-critical: propose and wait for confirmation.

## Output

- **Policy mapping:** which rule in `07-content-moderation-policy.md` this implements.
- **Action model:** the states, transitions and enum values used.
- **Transparency:** exactly what the affected user is told, and how.
- **Appeal path.**
- **Audit:** the `AdminAction` written and by whom.
- **Permissions** required, and why that is the minimum.
- **Docs** to update.
