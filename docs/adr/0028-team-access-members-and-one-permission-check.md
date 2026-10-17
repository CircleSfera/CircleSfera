# ADR-0028: Team access to a Business Profile — members and one permission check

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** CircleSfera owner, CircleSfera engineering

## Context

The owner decided that several people can work on one Business Profile, each with their own account
and a role: Administrator or Editor, besides the owner (Product Decision PD-014). Nobody shares a
password.

Today a Profile belongs to exactly one account (`Profile.userId`). The session accepts only Profiles
of that account, and the services check ownership by account in about a hundred places. Most of them
trust the Profile of the session once the session is valid.

## Decision

### Members

A new table, `profile_members`, records each person who works on a Profile that is not theirs.

- **Who:** the Profile, the person (`User`), the role, the state, who invited them, and when they
  accepted or were removed.
- **Roles:** `ADMINISTRATOR` or `EDITOR`.
- **States:** `INVITED`, `ACTIVE`, `PAUSED` (the Business plan ended), `DECLINED` and `REMOVED`.
- **One row per person and Profile.** A new invitation after a removal or a decline reuses the row.

The owner is not a row. The owner is the person whose account holds the Profile (`Profile.userId`),
one per Profile, and the role is not transferable in this version.

### One permission check

`ProfileAccessService.can(userId, profileId, action)` is the only place that answers whether a
person can do an action on a Profile.

- **The owner** can do every action.
- **An `ACTIVE` member** can do what their role allows, from the closed table below.
- **Nobody else** can do anything: a member who is invited, paused, declined or removed, or any
  other person.

| Action | Owner | Administrator | Editor |
| --- | --- | --- | --- |
| `content.manage`: publish, edit and delete content | yes | yes | yes |
| `comments.answer` | yes | yes | yes |
| `analytics.read` | yes | yes | yes |
| `profile.edit`: the Profile and its settings | yes | yes | no |
| `promotions.create` | yes | no | no |
| `billing.manage`: plan, payouts and company verification | yes | no | no |
| `team.manage`: invite and remove people | yes | no | no |
| `messages.read`: read and answer direct messages | yes | no | no |
| `profile.delete` | yes | no | no |

### Order of the changes

The steps follow PD-014:

1. The table and the check. Nothing uses them yet.
2. Invitation, acceptance, decline and removal, with the owner's team screen. The rules: at most 5
   members, counting those invited and those active; only a Business Profile has a team; a
   person accepts only with two-step verification on.
3. The session can hold a Profile the person is an active member of, and the Profile switcher
   shows it. Until each service asks the check (steps 4 and 5), a member's session is **refused
   everywhere except the routes its role allows**. The default is to refuse: a route that nobody
   has reviewed is closed to members, never open to them.
4. Content actions ask the check, and record the acting person.
5. Analytics and Profile settings by role.
6. The owner's activity log.
7. Pausing members when the Business plan ends, and resuming them when it returns; the public
   texts.

## Consequences

- Authorization moves, step by step, from "the account owns the Profile" to "this person can do
  this on the Profile".
- The token keeps saying who the person is. The Profile of the session may be one the person is a
  member of, and the session says so.
- A route the review missed is closed to members, not open to them.

## Alternatives rejected

- **The owner as a member row.** Two sources of truth for who owns a Profile, and a way to lose the
  owner by deleting a row.
- **A free permission editor.** More than a small company needs, and every combination would need
  to be reviewed. The owner chose three fixed roles.
- **Opening the session to members before the services ask the check.** Most services trust the
  Profile of the session, so an Editor could read direct messages. Refusing by default closes that
  until each route is reviewed.
