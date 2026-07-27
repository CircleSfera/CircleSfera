# CircleSfera AI Engineering Framework (CAEF) — v1

An in-repository operating system for AI-assisted engineering on CircleSfera.

Instead of pasting ad-hoc prompts, every AI session loads the same project context, is routed
to the same specialists, and follows the same verifiable protocol. The framework is versioned
next to the code so it evolves with the product.

## Why this exists

CircleSfera is a production social platform: 65 Prisma models, 46 NestJS modules, a
React 19 SPA, Stripe Connect money flows, chat encryption, moderation and GDPR obligations.
At that size, isolated prompts produce inconsistent decisions. This framework makes the
decision process itself consistent.

## Layout

```text
.ai/
├── core/          Permanent project context (what CircleSfera is, how it is built)
├── orchestrator.md  Task classification -> which specialists and playbook to run
├── agents/        Specialist roles with narrow scope and hard rules
├── playbooks/     End-to-end workflows (feature, bug, refactor, release, incident, ...)
├── checklists/    Gates that must be satisfied before calling work done
└── templates/     Skeletons for ADRs, PRDs, API contracts, migrations, postmortems
.cursor/rules/     Thin Cursor rules that load the right .ai/ files per file type
.agents/           Antigravity adapter: workspace rules + /slash-command workflows
```

## How to use it

**In Cursor.** `.cursor/rules/00-global.mdc` and `05-orchestrator.mdc` load on every request;
the numbered rules auto-attach by file path. You normally do not need to name a role — describe
the task and let [`orchestrator.md`](./orchestrator.md) route it.

**Explicitly, when you want a specific lens.** Reference the file and state the task:

```text
@.ai/playbooks/feature.md
Add collaborative lists to collections.
```

```text
@.ai/agents/security.md @.ai/checklists/security.md
Review the appeal token flow in circlesfera-backend/src/appeals.
```

**In Antigravity.** [`.agents/rules/`](../.agents/README.md) mirrors the Cursor routers and
[`.agents/workflows/`](../.agents/workflows/) exposes the playbooks as slash commands (`/feature`,
`/bug`, `/incident`, …). Activation modes are stored outside the repo, so set them once per clone —
the table in `.agents/README.md` lists them.

**In other agent tools** (Claude Code, Codex, cloud agents): the same files work as plain markdown
context. Point the tool at `.ai/core/` plus the relevant playbook.

## Non-negotiables

1. [`AGENTS.md`](../AGENTS.md) at the repo root outranks everything in `.ai/`. This framework is
   the operational layer under those rules, never a workaround for them.
2. `.ai/` is **not** a second source of truth. Every file declares what it derives from, and
   [`core/sources-of-truth.md`](./core/sources-of-truth.md) defines precedence. When a file here
   disagrees with the code, the code wins and the file gets fixed.
3. Product and architecture documentation lives in
   [`circlesfera-documentation/`](../circlesfera-documentation/README.md) and durable decisions in
   [`adr/`](../circlesfera-documentation/adr/README.md). `.ai/` links to them instead of copying
   them.

## Maintenance policy

- Keep each file focused and short enough to read in one sitting; Cursor's own guidance caps a
  rule at 500 lines, and the same discipline applies here.
- Prefer file references (`circlesfera-backend/src/...`) over pasted snippets, so the framework
  does not rot when the code changes.
- When a claim here becomes false, fix it in the same PR as the code change. A stale context file
  is worse than a missing one, because agents trust it.
- Add a new agent only when routing keeps landing on a gap. Use
  [`templates/agent.md`](./templates/agent.md).
- Tool adapters (`.cursor/rules/`, `.agents/`) hold routing only. When you change one adapter's globs
  or add a playbook, mirror it in the other; when you change a *fact*, change it in `.ai/`.
- Record durable decisions as ADRs in `circlesfera-documentation/adr/`, not as prose in `.ai/`.

## Verification status

Content was derived from the repository on **2026-07-27** by reading `schema.prisma`,
`package.json` files, module sources, configs, workflows and the existing documentation set.
Known contradictions found during that pass are recorded in
[`core/known-gaps.md`](./core/known-gaps.md) rather than smoothed over.
