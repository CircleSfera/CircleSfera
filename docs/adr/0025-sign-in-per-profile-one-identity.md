# ADR-0025: Sign-in per Profile, one identity behind

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** CircleSfera owner, CircleSfera engineering

## Context

A `User` row is three things at once: the person (identity verification, date of birth, Stripe
customer and Connect account, data rights, account-wide ban), the sign-in (email, password,
two-factor secret, passkeys, refresh tokens, reset and verification tokens) and the owner of one or
more `Profile` rows. A person with several Profiles has one email and one password for all of them.

The owner decided that each Profile signs in with its own credentials and holds its own Platform
Plan, while the identity behind stays one per person. A Profile may share a sign-in with another
Profile of the same person, or have its own. This is the model of Instagram accounts linked in an
Accounts Center.

Two ways to get there were weighed.

1. **Keep `User` as the sign-in and add an identity above it.** Each sign-in is a `User`; a person
   with two sign-ins has two `User` rows linked to one identity. The credential code stays as it is,
   but everything keyed by `User.id` that belongs to the person (transactions, unlocks, payouts,
   subscriptions, data exports, appeals, experiments: about thirty relations) would have to be
   re-read through the identity. A missed place is a purchase or a payout that goes missing for the
   person after they give a Profile its own sign-in.
2. **Keep `User` as the identity and move the sign-in out of it.** The money and the data rights do
   not move. What changes is the authentication code, which is concentrated: `auth.service.ts`,
   `passkey.service.ts`, `two-factor.service.ts`, the JWT strategy, the email-verified guard and the
   account screens of `users.service.ts`.

## Decision

Option 2. `User` stays the identity. A new `SignIn` holds the credentials.

### Data model

```
User (identity, unchanged key)        SignIn (credentials)             Profile
  id                              ┌──  id                          ┌──  id
  identityVerifiedAt, dateOfBirth │    userId  ───────────► User   │    userId   ───► User
  stripeCustomerId                │    email (unique)              │    signInId ───► SignIn
  stripeConnectAccountId          │    password                    │    username (unique)
  isRootBanned, deletion fields   │    emailVerified               │    ...
  profiles, signIns ◄─────────────┘    verificationToken           │
                                       resetToken, resetTokenExpires
                                       passwordResetRequiredAt
                                       isTwoFactorEnabled, twoFactorSecret
                                       passkeys, refreshTokens
```

- A `SignIn` belongs to one `User` and serves one or more of that User's Profiles.
- `Profile.signInId` is required once the backfill has run. `Profile.userId` stays: it is the fast
  path to the identity and the guard that a Profile never points to a sign-in of another person.
  A database constraint keeps the two in agreement.
- `SignIn.email` is unique across the table, as `User.email` is today.
- `Passkey`, `PasskeyChallenge` and `RefreshToken` point to the `SignIn`. They keep `userId` too,
  for the queries that act on the whole person (revoke everything on an account-wide ban).
- A phone number, when it comes, is a field of `SignIn`.

### Behaviour

- **Signing in.** By email: the `SignIn` with that email. By username: the Profile, then its
  `SignIn`. The password, the two-factor check and the passkeys are those of that `SignIn`. The
  session opens on the Profile named, or on the last one used among those the `SignIn` serves.
- **Sessions.** The access token carries the identity (`userId`, as today), the `signInId` and the
  Profile in use. Person-level code keeps reading `userId` and does not change.
- **Switching Profile.** Allowed between the Profiles of one `User` without a password, as today,
  whichever `SignIn` each one uses. They are linked because they are the same person.
- **Giving a Profile its own sign-in.** Creates a `SignIn` (new email, verified by the usual email
  link, new password) and points the Profile to it. Going back to sharing points the Profile to
  another `SignIn` of the same `User` and removes the one left with no Profile.
- **Recovery and verification** work on the `SignIn`: resetting a password changes it for the
  Profiles that share that `SignIn` and for no other.
- **Email notices** go to the email of the `SignIn` of the Profile they are about.
- **The last sign-in cannot be removed.** A `User` always has at least one `SignIn`, and every
  Profile always has one.

### Order of the changes

Each step is one change, deployable and reversible on its own.

1. **Table and backfill.** `SignIn` created; one per existing `User` with its credentials copied;
   every Profile pointed to it. From this step on, the credential writes go to both places, so the
   two never differ while the readers are still being moved.
2. **Password sign-in, recovery and email verification** read the `SignIn`.
3. **Two-factor and passkeys** read the `SignIn`.
4. **Sessions** carry `signInId`; refresh tokens belong to the `SignIn`.
5. **App**: the screen where a Profile sets its own email and password or goes back to sharing, and
   the choice when creating a Profile.
6. **Platform Plan per Profile**: the plan guard, the billing status, the verified badge and the
   one-active-plan rule look the plan up by Profile.
7. **Phone number** on the `SignIn`, with an SMS provider.
8. **Removal** of the credential columns from `User`, once step 4 has been in production long
   enough to be sure nothing reads them.

Steps 1 to 4 change nothing a person can see: every account keeps one sign-in that serves all of
its Profiles.

### Relation to ADR-0003 (one active Platform Plan)

ADR-0003 records that a `User` holds at most one active Platform Plan, checked in
`PaymentsService.createCheckout`. Step 6 changes whose rule that is: one active plan **per
Profile**. This record supersedes ADR-0003 in that one point, from the moment step 6 is on `main`.
Until then ADR-0003 describes what the code does, and steps 1 to 5 do not touch it.

Step 6 is a change of schema and of billing rules and is proposed and confirmed on its own before
it is built. What it has to settle is named here so that it is not left implicit:

- **Ownership.** `PlatformSubscription` gains the Profile it belongs to. The Stripe customer and
  the payer stay on the `User`: one person pays for the plans of their Profiles.
- **Uniqueness.** The uniqueness on (`userId`, `planId`) becomes one on the Profile and the plan,
  and the one-active-plan check looks at the subscriptions of that Profile.
- **Existing subscriptions.** Each is assigned to one Profile of its `User`. Which one, when the
  `User` has several, is part of the proposal of step 6.
- **Readers.** The plan guard, the billing status and the verified badge resolve the plan from the
  Profile in use.

When step 6 lands, ADR-0003 is marked as superseded in part by this record.

## Consequences

- The guardrail "credentials attach to `User.id`" becomes "credentials attach to `SignIn.id`;
  identity, billing and data rights attach to `User.id`".
- Between steps 1 and 8 the credentials exist in two places. Step 1 writes both in one transaction;
  a check that compares them runs in the test suite and can be run against production.
- Code that reads `req.user.email` gets the email of the sign-in in use, which for an account with
  one sign-in is the same value as today.
- An account-wide ban, a deactivation and a deletion act on the `User` and therefore on all of its
  sign-ins and Profiles, as today.
- A person can end up with several emails. Uniqueness, verification and the abuse limits on sign-up
  apply to each `SignIn`.
- Staff identities (`AdminIdentity`) are not affected: they never used `User` credentials.

## Alternatives rejected

- **An identity above `User`** (option 1 above): the larger and riskier change, in the money code.
- **Credentials as nullable columns on `Profile`, falling back to the `User`**: two places to look
  for a password on every sign-in, and no row to hang passkeys, sessions and recovery on.
- **One `SignIn` per Profile, always**: every existing secondary Profile would need a new email
  before the migration could run, and the simple case (one person, one login) would get harder.
