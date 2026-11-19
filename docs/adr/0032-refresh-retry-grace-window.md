# ADR-0032: A renewal retried within 30 seconds is not taken as a stolen refresh token

- **Status:** Accepted
- **Date:** 2026-11-19
- **Deciders:** CircleSfera owner, CircleSfera engineering
- **Scope:** backend | trust & safety
- **Amends:** [ADR-0007](./0007-auth-cookies-csrf.md)

## Context

ADR-0007 keeps the session in HTTP-only cookies with a rotating refresh token. Every renewal
(`POST /auth/refresh`) revokes the refresh token it was sent and answers with a new one in the
same token family. A revoked token that comes back is taken as theft (RFC 6819): the whole family
is deleted, which signs that sign-in out on every device.

That rule cannot tell a thief from the person in two cases:

- **The answer never arrives.** The server revokes the old token and issues the new one, but the
  connection drops, the app is closed or the phone goes to sleep before the new cookie is stored.
  The person still holds the old token, and their next renewal ends every session.
- **Two renewals at the same moment.** Two requests with the same live token both read it as
  live, because the check and the revoke were two separate steps. Each got a token of its own.

The web app shares one renewal between its requests, its live connection and its tabs (#1080),
but a lost answer, a tab still running an earlier build and a WebView without Web Locks remain.

Identity providers handle this with a short reuse interval: a just-replaced refresh token is
accepted again for a few seconds, as long as the token that replaced it has not been used.

## Decision

**Renewals of one session run one at a time.** `AuthService.refreshToken` reads the token again,
revokes it and writes the new token inside one transaction that first locks the token sent and the
live tokens of its family (`SELECT ... FOR UPDATE`). The next renewal of the session waits for
that transaction and sees everything it wrote. With the lock held:

- the token no longer exists (the session was closed: sign-out, password change, ban): the renewal
  is refused and nothing is issued;
- the token is live: it is revoked, and a new pair is issued in the same family;
- the token is revoked: it is accepted as the **retry of the renewal that revoked it** only when
  all of the following hold; otherwise the family is deleted, in the same transaction, and the
  renewal refused ("Refresh token reuse detected"):
  - the token was stored with its own family;
  - it was revoked at most **30 seconds** ago (`REFRESH_RETRY_GRACE_MS`; a token revoked before
    `revokedAt` was recorded never qualifies);
  - no token of its family was revoked after it (the token that renewal issued was never used);
  - at most one token of its family is live (the one that renewal issued, or none if issuing it
    failed).

A retry withdraws the family's live token, the one the lost answer carried, and issues a new pair
in the same family. Everything else a renewal checks still applies first: expiry, account and
Profile standing, and the session's sign-in.

Because a retry withdraws the live token, it counts as a later renewal: of several replays of the
same token sent together, the lock lets the first through and every later one ends the family. Two
renewals of the same live token sent together leave one live token: the second finds the token
the first wrote, and withdraws it as a retry.

Staff renewals (`POST /admin-auth/refresh`) do not delete families and are unchanged.

## Consequences

- A dropped connection, a closed app or two renewals racing no longer sign a person out of every
  device.
- **What it gives up:** for 30 seconds after a renewal, someone who stole the replaced token and
  uses it before the person uses the new one gets a session, and keeps it until the person's next
  renewal; if the person does not come back, until the refresh token expires (7 days). That next
  renewal presents a token the thief's use revoked: within 30 seconds of that use it is again
  taken as a retry, otherwise it ends the family, the thief's session included. The refresh token
  is an HTTP-only cookie, so stealing it already needs access to the device or the connection.
- After a change of Profile the family has two live tokens, so a retry in that session ends the
  family as before: it fails safe.
- A tab or app running an earlier build keeps working, without ending sessions, while it renews.
- **Not closed here:** a sign-out, password change or ban takes no lock. One that deletes the
  session's tokens while a renewal holds the lock waits for it, then deletes only the rows it could
  already see, so the token that renewal wrote stays live. This was already so before this
  decision (the window was the renewal itself); closing it needs those writers to take the same
  lock.
- `revokedAt` comes from the application server's clock. The backend runs as one process today
  (ADR-0024); with several, their clocks must agree to within the window.
- Every retry is logged (user and family, never a token).

## Alternatives considered

- **Keep deleting the family on any reuse.** The strictest option, but it signs people out for
  something they did not do, and only the server can see the difference.
- **A longer window (minutes).** Covers a phone that sleeps longer, but widens what a stolen token
  is good for. 30 seconds covers a dropped answer and an immediate retry.
- **Only fix the client.** Done as well (#1080), but a lost answer cannot be fixed on the client.
- **Remember the issued pair and answer the retry with the same tokens.** Would need storing the
  issued refresh token in a form that can be sent again; tokens are stored only as hashes.
- **Bind the retry to the stored user agent.** Adds little: a thief who has the cookie usually
  sends it from the same browser, and a legitimate retry can come from an updated app.
