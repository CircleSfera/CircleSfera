# Antigravity workspace configuration

Adapter that points Google Antigravity at the same framework Cursor uses. The substance lives in
[`.ai/`](../.ai/README.md); everything here is a thin router, so there is one copy to maintain.

## Layout

```text
.agents/
└── workflows/   Slash commands (/feature, /architecture, /schema-change, /ui-redesign, /bug, /incident, /audit, /docs-sync, ...) mapped to .ai/playbooks/
```

Antigravity automatically discovers and loads workflows from `.agents/workflows/`
([official docs](https://antigravity.google/docs/rules-workflows)). It also automatically reads the root
[`AGENTS.md`](../AGENTS.md), which outranks everything here and in `.ai/`.

## Zero-Config Architecture

Unlike Cursor, which uses `.mdc` files and globs to inject context (`.cursor/rules/`), Antigravity requires **no UI configuration** when cloning this repository.

1. **Autonomous routing**: By reading the orchestrator (including Step 0 intent inference), Antigravity
   will select playbooks and specialists, auto-chain schema/architecture/feature when needed, and
   default to **ship** unless the user clearly wants advice or review only.
2. **Root `AGENTS.md`**: Automatically loaded on every interaction.
3. **Workflows**: Optional shortcuts (`/feature`, `/architecture`, `/schema-change`, …). The agent
   must not require a slash command to know what to do. Confirmation-list work still pauses for
   approval, then continues end-to-end.

**Note**: To keep both tools aligned, maintain the `.cursor/rules/*.mdc` files for Cursor users, and update `.ai/` whenever the core logic or rules of the project change.

## Constraints to respect

- Workflow files are capped at **12,000 characters** each. These files stay far under that
  because they reference `.ai/` instead of copying it.
- `@/path/to/file.md` inside a workflow resolves repo-relative, which is how these routers pull in the
  canonical `.ai/` context.
- Do not add project facts here. Facts belong in `.ai/core/`, decisions in
  [`circlesfera-documentation/adr/`](../circlesfera-documentation/adr/README.md).
- `.agents/` supersedes the older `.agent/` directory; do not create both.
