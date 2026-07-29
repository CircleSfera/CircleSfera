# Antigravity workspace configuration

Adapter that points Google Antigravity at the same framework Cursor uses. The substance lives in
[`.ai/`](../.ai/README.md); everything here is a thin router, so there is one copy to maintain.

## Layout

```text
.agents/
└── workflows/   Slash commands (/feature, /bug, /incident, ...) mapped to .ai/playbooks/
```

Antigravity automatically discovers and loads workflows from `.agents/workflows/`
([official docs](https://antigravity.google/docs/rules-workflows)). It also automatically reads the root
[`AGENTS.md`](../AGENTS.md), which outranks everything here and in `.ai/`.

## Zero-Config Architecture

Unlike Cursor, which uses `.mdc` files and globs to inject context (`.cursor/rules/`), Antigravity requires **no UI configuration** when cloning this repository.

1. **Root `AGENTS.md`**: Automatically loaded on every interaction. It directs Antigravity to always read `.ai/orchestrator.md` before proceeding with complex tasks.
2. **Autonomous Routing**: By reading the orchestrator, Antigravity will proactively fetch the required specialist roles (`.ai/agents/`) and playbooks (`.ai/playbooks/`) using its file-reading capabilities under the hood.
3. **Workflows**: Typing `/feature` or `/bug` triggers the predefined workflow in `.agents/workflows/` without any manual setup.

**Note**: To keep both tools aligned, maintain the `.cursor/rules/*.mdc` files for Cursor users, and update `.ai/` whenever the core logic or rules of the project change.

## Constraints to respect

- Workflow files are capped at **12,000 characters** each. These files stay far under that
  because they reference `.ai/` instead of copying it.
- `@/path/to/file.md` inside a workflow resolves repo-relative, which is how these routers pull in the
  canonical `.ai/` context.
- Do not add project facts here. Facts belong in `.ai/core/`, decisions in
  [`circlesfera-documentation/adr/`](../circlesfera-documentation/adr/README.md).
- `.agents/` supersedes the older `.agent/` directory; do not create both.
