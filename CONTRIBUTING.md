# Contributing to CircleSfera

Thanks for helping improve CircleSfera. This project is a production social platform — prefer small, reviewable changes that match the real schema and shipped APIs.

## Before you start

1. Read [AGENTS.md](./AGENTS.md) for operational rules (source-of-truth order, security, change policy).
2. Treat [`circlesfera-backend/prisma/schema.prisma`](./circlesfera-backend/prisma/schema.prisma) as the data model source of truth.
3. Check [ADRs](./circlesfera-documentation/adr/README.md) for durable architectural decisions.
4. Skim [`.ai/core/`](./.ai/README.md) for the condensed repo context (stack, architecture, conventions, quality bar) and [`.ai/core/known-gaps.md`](./.ai/core/known-gaps.md) for known doc/code drift.

## Development setup

Follow the Quick Start in the root [README.md](./README.md). Backend and frontend each have their own README.

## Pull requests

- Keep PRs focused; split schema, auth/payments, and large UI changes when possible.
- Schema/API/auth/monetization changes need explicit rationale and migration notes.
- Run relevant lint/tests (`npm run check` at root; backend/frontend test scripts as applicable).
- Do not commit secrets (`.env`, keys, tokens).
- Update docs when behavior or contracts change in a user-visible or operator-visible way.
- Before requesting review, walk the relevant gate in [`.ai/checklists/`](./.ai/checklists/README.md) (`pull-request.md` always; plus `api`, `database`, `security`, `ui`, `accessibility`, `performance` or `release` when they apply).

## AI-assisted contributions

AI agents are welcome, but they follow the same rules as humans:

- [AGENTS.md](./AGENTS.md) has the highest precedence and overrides anything under `.ai/`.
- [`.ai/orchestrator.md`](./.ai/orchestrator.md) routes a task to a playbook in [`.ai/playbooks/`](./.ai/playbooks/README.md) and the specialist roles in [`.ai/agents/`](./.ai/agents/README.md).
- Cursor users get the relevant context automatically through [`.cursor/rules/`](./.cursor/rules/); Antigravity users through [`.agents/`](./.agents/README.md), which also exposes the playbooks as slash commands. Other tools should be pointed at `.ai/core/` plus the applicable playbook.
- `.ai/` is documentation, not a source of truth. If a statement there contradicts the code, the code wins and the `.ai/` file is corrected in the same PR.

## Commit style

Prefer clear, imperative messages that explain **why** (e.g. Conventional Commits are welcome but not required).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
