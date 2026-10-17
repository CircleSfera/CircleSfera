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

### The member session (step 3)

- The token still names the person. The session may be bound to a Profile of someone else, and
  counts only while the person is an active member of it. Otherwise it falls back to the person's
  own Profiles, as before. The JWT check and the token refresh resolve it the same way, and the
  session carries the role.
- A global interceptor runs after the guards, once the session is known. It refuses a member
  session on every route, except those marked with `@MemberAllowed`:
  - `session`, for every role: keeping and leaving the session. That covers switching Profile,
    the own Profile, the list of own Profiles, sessions, logging out, invitations and team
    Profiles;
  - `browse`, for every role: reading what anyone signed in may read. That covers the feeds,
    posts, public Profiles, search, stories and comments;
  - an action of the table, for the roles that allow it. None is opened in step 3: content
    opens in step 4, when the acting person is recorded.
- Direct messages, money, the owner's notices, the account and staff stay closed. A test fails if
  any route in those areas is marked.
- The own Profile (`GET /profiles/me`) of a member session is the Profile as anyone sees it, with
  the role. It never includes the owner's account, settings or sign-in.
- The realtime socket picks the Profile among the person's own only. A member session therefore
  gets the socket of the person's own Profile and never the Business Profile's messages.

### Content by role (step 4)

- Every role can publish, edit and delete posts and stories, and upload their media. Every role
  can also write, edit and delete comments. The Profile is still the author: ownership is
  checked against the Profile of the session, so a member acts on the Business Profile's content.
- Setting a price on content is money, so it stays with the owner. A member's post or story with
  a price is refused, and the composer does not offer one.
- Each of those actions on a Business Profile is recorded in `profile_activities` once it
  succeeds: the Profile, the person, the action and the target. That covers the owner's own
  actions too. A failure to record never fails the action. The person's data export lists the
  activity, and the owner's activity log (step 6) reads it.

### Figures and the Profile by role (step 5)

- **Every role reads the figures** (`analytics.read`):
  - the creator stats, the activity chart and the content lists with their figures;
  - audience retention and the best posts;
  - the analytics dashboard and each post's insights.

  None of these answers carries money. The revenue figures, their export and promotions stay with
  the owner. A test fails if any other route of the creator tools opens to a member.
- **Viewing events** (views, loops, watch time) are open to every role as `browse`, so a member
  browsing as the Profile is counted like any viewer.
- **Editing the Profile** (`profile.edit`) is open to the owner and administrators. It is recorded
  as `PROFILE_EDITED`.
  - An administrator never changes the kind of the Profile, which would take it out of Business.
  - An editor sees that the Profile is edited by the owner or an administrator.
  - The company verification stays with the owner.

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
