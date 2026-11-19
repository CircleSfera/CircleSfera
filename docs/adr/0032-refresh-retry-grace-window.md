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
  live, because the check and the revoke were two separate steps. Each gets a token of its own.

The web app shares one renewal between its requests, its live connection and its tabs (#1080),
but a lost answer, a tab still running an earlier build and a WebView without Web Locks remain.

Identity providers handle this with a short reuse interval: a just-replaced refresh token is
accepted again for a few seconds, as long as the token that replaced it has not been used.

## Decision

`AuthService.refreshToken` accepts a revoked refresh token as the **retry of the renewal that
revoked it** when all of the following hold:

- it was revoked at most **30 seconds** ago (`REFRESH_RETRY_GRACE_MS`; a token revoked before
  `revokedAt` was recorded never qualifies);
- no token of its family was renewed after it (the token that renewal issued was never used);
- at most one token of its family is live (the one that renewal issued, or none if issuing it
  failed).

A retry withdraws the family's live token, the one the lost answer carried, and issues a new pair
in the same family. Everything else a renewal checks still applies first: expiry, account and
Profile standing, and the session's sign-in.

Outside those conditions nothing changes: the family is deleted and the renewal is refused
("Refresh token reuse detected").

The revoke of a live token is conditional (`updateMany` where `isRevoked` is false). Of two
renewals that read the same token as live, the one that finds it already revoked is handled as
that renewal's retry, instead of each getting a token of its own.

Staff renewals (`POST /admin-auth/refresh`) do not delete families and are unchanged.

## Consequences

- A dropped connection, a closed app or a race between renewals no longer signs a person out of
  every device.
- **What it gives up:** for 30 seconds after a renewal, someone who stole the replaced token and
  uses it before the person uses the new one gets a session. The person's next renewal then
  presents a token revoked by that use. Within 30 seconds of it, that is again taken as a retry;
  after that, it ends the family, the thief's session included. The refresh token is an HTTP-only
  cookie, so stealing it already needs access to the device or the connection.
- A tab or app running an earlier build keeps working, without ending sessions, while it renews.
- Two renewals that race can each leave a token live in the family; only the cookie the browser
  kept is used afterwards. That is hygiene, not a sign-out, and expires with the token.
- Every retry is logged (user and family, never a token).

## Alternatives considered

- **Keep deleting the family on any reuse.** The strictest option, but it signs people out for
  something they did not do, and only the server can see the difference.
- **A longer window (minutes).** Covers a phone that sleeps longer, but widens what a stolen token
  is good for. 30 seconds covers a dropped answer and an immediate retry.
- **Only fix the client.** Done as well (#1080), but a lost answer cannot be fixed on the client.
- **Remember the issued pair and answer the retry with the same tokens.** Would need storing the
  issued refresh token in a form that can be sent again; tokens are stored only as hashes.
</content>
</invoke>
<invoke name="Bash">
<parameter name="command">cd /c/Users/EasyFeliu/Documents/Projects/CircleSfera-grace && python3 - 2>/dev/null || node -e "
const fs=require('fs');const f='docs/adr/README.md';let s=fs.readFileSync(f,'utf8');
s=s.replace('| [0007](./0007-auth-cookies-csrf.md) | HTTP-only auth cookies + CSRF double-submit | Accepted |','| [0007](./0007-auth-cookies-csrf.md) | HTTP-only auth cookies + CSRF double-submit | Accepted (amended by 0032) |');
const row='| [0031](./0031-staff-identity-own-credentials.md) | Staff sign in with credentials of their own (invitation link, own password, passkeys next), never with a CircleSfera account; amends 0013 | Accepted |';
if(!s.includes(row))throw 'no row';
s=s.replace(row,row+'\n| [0032](./0032-refresh-retry-grace-window.md) | A renewal retried within 30 seconds, while the token it issued is unused, is not taken as a stolen refresh token; conditional revoke; amends 0007 | Accepted |');
fs.writeFileSync(f,s);" && git -c core.autocrlf=false diff docs/adr/README.md | grep "^[+-]|"; grep -n "Amended\|amended\|Status" docs/adr/0007-auth-cookies-csrf.md | head