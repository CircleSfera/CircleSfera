# ADR-0031: Staff sign in with credentials of their own, never with a CircleSfera account

- **Status:** Accepted
- **Date:** 2026-11-10
- **Deciders:** CircleSfera owner, CircleSfera engineering
- **Scope:** backend | frontend | data | trust & safety
- **Amends:** [ADR-0013](./0013-admin-panel-admin-identity.md)

## Context

ADR-0013 gave staff a separate identity (`AdminIdentity`) with its own password and mandatory
TOTP. Later, the staff password was found to drift from the password the owner used everywhere
else, and staff were made to sign in with the password of their CircleSfera account. From then on:

- creating an operator needed an existing CircleSfera account with the same email;
- `AdminIdentity.passwordHash` held a placeholder that matches nothing;
- whoever took over that account (a stolen password, or a reset through the account's email) was
  one authenticator code away from the staff sites;
- an external reviewer, such as the payment provider, had to sign up to the social network first.

Large social networks keep two identity systems that share nothing: the participants' accounts,
and a workforce identity given and taken away by the company, with phishing-resistant
authentication. A member of staff who also uses the network has a personal account unrelated to
their access.

## Decision

A staff identity signs in to the Admin Panel and the Backoffice with **credentials of its own**,
and no CircleSfera account is needed or used.

- **Invitation.** An administrator creates the identity (email, name, roles and, optionally, an
  end date). The staff email receives a link that works once for 24 hours, or the administrator
  hands over a code. With it, the person sets a staff password and, unless they are an external
  reviewer, enrols the authenticator. Nothing else is needed.
- **Staff password.** At least 12 characters, not in the list of known leaked passwords, and never
  the password of the CircleSfera account with the staff email. Stored with argon2 in
  `AdminIdentity.passwordHash`. It is changed while signed in, with the current password and,
  for a member of staff, an authenticator code. Changing it ends every other session.
- **No reset by email alone.** A forgotten password or a lost authenticator is recovered with a
  new link or code from an administrator, and that step is audited. A mailbox alone never opens the
  staff sites.
- **Passkeys.** Staff passkeys (`admin_passkeys`) become the main way in for members of staff,
  required for them. The relying party is `circlesfera.com` and only the staff hosts are accepted
  origins. The staff password with the authenticator code remains the backup. This is delivered in
  a following change.
- **Linked account.** `linkedUserId` stays optional and never takes part in signing in. Staff
  actions stop showing a member of staff's personal Profile; notifications from moderation come
  from CircleSfera. This is delivered in a following change.
- **Migration.** An identity that has not set its own password yet still signs in the old way,
  with its linked account's password and TOTP. The staff sites ask it to set its own; once it has,
  the account password opens nothing there. The old way is removed in a later change, confirmed
  first.

Public sign-up and sign-in do not change (ADR-0025).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep staff on their CircleSfera account's password | A takeover of the public account is one code away from the staff sites, and reviewers must join the network |
| Sign-in with an outside workforce identity provider (Google Workspace, Microsoft) | Adds an outside provider and needs one contracted for every member of staff; the owner prefers technology built in house |
| Passkeys only, no staff password | Leaves no way in when a device is lost before a second passkey exists; the password with TOTP stays as the backup |
| Self-service password reset by email | Turns the mailbox into the only key; recovery goes through an administrator instead |

## Consequences

**Accepted costs.** Staff keep one more password, best kept in a password manager. Existing
identities have to set their own password once. An administrator, or the owner's break-glass
workflow, is needed to recover access.

**Constraints.** Never compare a staff password with, or derive it from, an account's. Never link
an account automatically when an identity is created. An external reviewer still signs in without
an authenticator, with an end date and a session capped at a working day.

**What this does not decide.** Device trust for staff, network restrictions for the staff sites,
and the removal of `User.role`.

## Implementation anchors

- `circlesfera-backend/src/admin-auth/admin-auth.service.ts`: sign-in, `setUpAccess`, `changePassword`
- `circlesfera-backend/src/admin-auth/enrolment-proof.service.ts`: the link and the code
- `circlesfera-backend/src/admin/admin-operators.service.ts`: creating identities without an account
- `circlesfera-backend/src/admin/staff-password.constants.ts`: the placeholder of identities without their own password
- `circlesfera-frontend/src/pages/AdminPanelLogin.tsx`, `src/components/admin/StaffPassword.tsx`
- `circlesfera-backend/scripts/staff-account-access.ts`: the staff access check

## Revisiting

Revisit when CircleSfera contracts a workforce identity provider for all staff, or when staff
must sign in only from managed devices.
