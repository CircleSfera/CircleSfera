# Contributing to CircleSfera

Thanks for helping improve CircleSfera. This project is a production social platform — prefer small, reviewable changes that match the real schema and shipped APIs.

## Before you start

1. Read [AGENTS.md](./AGENTS.md) for operational rules (source-of-truth order, security, change policy).
2. Treat [`circlesfera-backend/prisma/schema.prisma`](./circlesfera-backend/prisma/schema.prisma) as the data model source of truth.
3. Check [ADRs](./docs/adr/README.md) for durable architectural decisions.
4. Read the relevant pages in [Notion → CircleSfera → Documentation](https://app.notion.com/p/3e9dfa08f2f580d2b0f7fe13c58f9f30) (product intent, architecture, quality gates, known conflicts).

## Development setup

Follow the Quick Start in the root [README.md](./README.md). Backend and frontend each have their own README.

## Branches

Do not develop on `main`. Use:

```text
feature/<short-slug>
fix/<short-slug>
refactor/<short-slug>
chore/<short-slug>
docs/<short-slug>
```

`main` is protected: force-pushes and branch deletion are disabled (including for admins). Merging to `main` deploys production (`.github/workflows/deploy.yml`).

## Pull requests

Open a PR for any meaningful change, even as a single developer. The PR should state objective, scope, architectural impact, tests, verification, risks, and migration notes when they apply.

- Keep PRs focused; split schema, auth/payments, and large UI changes when possible.
- Schema/API/auth/monetization changes need explicit rationale and migration notes.
- Run relevant lint/tests (`npm run check` at root; backend/frontend test scripts as applicable).
- Do not commit secrets (`.env`, keys, tokens).
- Update the Notion documentation when behavior or contracts change in a user-visible or operator-visible way.
- Before requesting review, walk the relevant gate in Notion → Execution → [Implementation Checklists](https://app.notion.com/p/3eadfa08f2f581a68accde43268a2a61).

## AI-assisted contributions

AI agents are welcome, but they follow the same rules as humans:

- [AGENTS.md](./AGENTS.md) holds the operating rules and guardrails; every agent reads it first.
- Cursor users get the relevant context automatically through [`.cursor/rules/`](./.cursor/rules/). Other tools should be pointed at `AGENTS.md`.
- Documentation is not a source of truth for current behavior. If a statement in Notion contradicts the code, classify the conflict (Notion → Governance → Cross-Domain Conflict Resolution) instead of silently changing either side.

## Commit style

Husky runs [commitlint](https://commitlint.js.org/) on `commit-msg`. Format:

```text
<type>(<scope>): <imperative description>
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.

Preferred scopes (from the as-built modules, not an exhaustive linter list): `auth`, `users`, `profiles`, `posts`, `stories`, `feed`, `search`, `media`, `messaging`, `notifications`, `live`, `creator`, `payments`, `admin`, `ai`, `ui`, `i18n`, `api`, `database`, `infra`, `ci`, `docs`, `e2e`, `deps`.

One commit is one logical change. File count does not matter; mixing unrelated domains does.

AI-assisted changes follow the same rule: identify logical units, separate unrelated diffs, then commit. Never land a generic “save all” changeset.

Examples:

```text
feat(auth): implement session management
fix(auth): preserve session after token refresh
refactor(ui): extract responsive layout primitives
test(publications): add publication validation coverage
docs(architecture): document authentication boundaries
ci: unify PR and deploy quality gates
```

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
