# Security Policy

## Supported versions

Security fixes are applied to the `main` branch of CircleSfera. There are no long-term support branches at this time.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email the maintainers privately with:

- A clear description of the issue and impact
- Steps to reproduce (PoC if available)
- Affected component (backend, frontend, infra, docs)

We aim to acknowledge reports within a few business days and to coordinate a fix before any public disclosure.

## Scope

In scope: authentication/session handling, CSRF, authorization/ownership bugs, injection, secret exposure in the repo or logs, payment webhook integrity, and media upload abuse that affects other users.

Out of scope for now: social-engineering of staff, denial-of-service volume testing without prior approval, and physical attacks.

## Secrets

Never commit `.env`, production credentials, Stripe/LiveKit/OpenAI keys, or `ENCRYPTION_KEY` material. Rotate any secret that may have leaked.
