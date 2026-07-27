# Contributing to CircleSfera

Thanks for helping improve CircleSfera. This project is a production social platform — prefer small, reviewable changes that match the real schema and shipped APIs.

## Before you start

1. Read [AGENTS.md](./AGENTS.md) for operational rules (source-of-truth order, security, change policy).
2. Treat [`circlesfera-backend/prisma/schema.prisma`](./circlesfera-backend/prisma/schema.prisma) as the data model source of truth.
3. Check [ADRs](./circlesfera-documentation/adr/README.md) for durable architectural decisions.

## Development setup

Follow the Quick Start in the root [README.md](./README.md). Backend and frontend each have their own README.

## Pull requests

- Keep PRs focused; split schema, auth/payments, and large UI changes when possible.
- Schema/API/auth/monetization changes need explicit rationale and migration notes.
- Run relevant lint/tests (`npm run check` at root; backend/frontend test scripts as applicable).
- Do not commit secrets (`.env`, keys, tokens).
- Update docs when behavior or contracts change in a user-visible or operator-visible way.

## Commit style

Prefer clear, imperative messages that explain **why** (e.g. Conventional Commits are welcome but not required).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
