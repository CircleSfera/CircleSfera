# Antigravity workspace configuration

Adapter that points Google Antigravity at the same framework Cursor uses. The substance lives in
[`.ai/`](../.ai/README.md); everything here is a thin router, so there is one copy to maintain.

## Layout

```text
.agents/
├── rules/       Workspace rules — persistent context, routed by activation mode
└── workflows/   Slash commands (/feature, /bug, /incident, ...) mapped to .ai/playbooks/
```

Antigravity reads workspace rules from `.agents/rules/` and workflows from `.agents/workflows/`
([official docs](https://antigravity.google/docs/rules-workflows)). It also reads the root
[`AGENTS.md`](../AGENTS.md), which outranks everything here and in `.ai/`.

## Activation modes — set these once in the UI

Antigravity stores a rule's activation mode outside the markdown file, so cloning this repo does
**not** configure it. Open the agent panel `...` → Customizations → Rules and set:

| Rule | Activation | Glob |
| --- | --- | --- |
| `00-global.md` | Always On | — |
| `05-orchestrator.md` | Always On | — |
| `10-backend.md` | Glob | `circlesfera-backend/src/**/*.ts` |
| `20-frontend.md` | Glob | `circlesfera-frontend/src/**/*.ts`, `circlesfera-frontend/src/**/*.tsx` |
| `30-database.md` | Glob | `circlesfera-backend/prisma/**` |
| `40-security.md` | Glob | `circlesfera-backend/src/auth/**`, `circlesfera-backend/src/admin/**`, `circlesfera-backend/src/main.ts`, `circlesfera-backend/src/common/config/**`, `circlesfera-backend/src/common/services/crypto.service.ts` |
| `50-uiux.md` | Glob | `circlesfera-frontend/src/components/**`, `circlesfera-frontend/src/pages/**`, `circlesfera-frontend/src/index.css`, `circlesfera-frontend/tailwind.config.js` |
| `60-payments.md` | Glob | `circlesfera-backend/src/payments/**`, `circlesfera-backend/src/monetization/**`, `circlesfera-backend/src/creator/**`, `circlesfera-backend/src/live/**`, `circlesfera-backend/src/common/stripe/**` |
| `70-testing.md` | Glob | `circlesfera-backend/src/**/*.spec.ts`, `circlesfera-backend/test/**/*.e2e-spec.ts`, `circlesfera-frontend/src/**/*.test.ts`, `circlesfera-frontend/src/**/*.test.tsx`, `e2e/**/*.spec.ts` |
| `80-docs.md` | Glob | `circlesfera-documentation/**`, `CHANGELOG.md`, `README.md`, `CONTRIBUTING.md` |
| `90-infra.md` | Glob | `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/**`, `scripts/**`, `circlesfera-backend/Dockerfile`, `circlesfera-frontend/Dockerfile` |

These globs are copied from the `globs:` frontmatter of the equivalent
[`.cursor/rules/`](../.cursor/rules/) file, so the two tools attach the same context to the same
files. Keep them in sync when you change one.

## Constraints to respect

- Rule and workflow files are capped at **12,000 characters** each. These files stay far under that
  because they reference `.ai/` instead of copying it.
- `@/path/to/file.md` inside a rule resolves repo-relative, which is how these routers pull in the
  canonical `.ai/` context.
- Do not add project facts here. Facts belong in `.ai/core/`, decisions in
  [`circlesfera-documentation/adr/`](../circlesfera-documentation/adr/README.md).
- `.agents/` supersedes the older `.agent/` directory; do not create both.
