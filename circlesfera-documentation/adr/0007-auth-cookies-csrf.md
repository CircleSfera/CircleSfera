# ADR-0007: HTTP-only auth cookies + CSRF double-submit

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

SPA clients need session auth without exposing long-lived tokens to JavaScript XSS. Cross-site request forgery remains a risk when cookies are sent automatically.

## Decision

Authenticate with **HTTP-only cookies** (access + refresh JWT rotation) and protect mutating requests with **CSRF double-submit** (`CSRF_SECRET`, cookie `x-csrf-token`, header mirrored by the client).

- Do not store access tokens in `localStorage` for the primary session.
- Frontend bootstraps session validity on cold start (`checkSession`) before trusting persisted auth flags.

Public Bearer/OAuth APIs for third parties are out of scope (see roadmap Later / OUT OF SCOPE).

## Consequences

- Better XSS resistance for tokens; CSRF must stay correctly wired on every cookie-authenticated write.
- Cross-origin SPA hosting requires careful cookie `SameSite` / domain / CSRF configuration.
- Mobile/native clients would need a separate auth story later (not this ADR).
