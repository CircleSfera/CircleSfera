# CircleSfera AI Engineering Framework (CAEF) — v1

In-repo operating system for AI-assisted engineering. One context, one router, one protocol —
versioned next to the code.

## Capabilities

This framework is meant to **ship product work**, not only review it. Agents following it must be
able to:

| Capability | How |
| --- | --- |
| **Product & design** | `feature` / `ui-redesign` + `product`, `ux-researcher`, `design-system` |
| **Architecture** | `architecture` playbook + `staff-architect` / `cto` → ADR when durable |
| **Implement (full stack)** | Controllers, services, DTOs, React, i18n, tests — `feature` / `bug` |
| **Schema / migrations** | `schema-change` — **allowed** after explicit confirmation; never invent models |
| **Money / T&S / privacy** | Same playbooks with `payments`, `trust-and-safety`, `privacy-compliance` |
| **Ops & release** | `release`, `incident`, `dependency-upgrade` |
| **Docs & audits** | `docs-sync`, `audit`, `security-audit` |

**Confirmation list ≠ forbidden.** Schema, auth, monetization, deps, and infra require a pause for
approval, then full implementation. Do not refuse in-scope engineering by citing the list.

**OUT OF SCOPE** in `00-status.md` is the real stop. Everything else is fair game under the
protocol.

## Layout

```text
.ai/
├── core/            Project facts (identity, stack, architecture, SoT, gaps)
├── orchestrator.md  Classify request → playbook + specialists
├── agents/          25 specialists (narrow scope + hard rules)
├── playbooks/       Workflows (feature, architecture, schema-change, ui-redesign, …)
├── checklists/      Done gates
└── templates/       ADR, PRD, migration, agent skeletons
.cursor/rules/       Cursor adapters (globs → .ai)
.agents/workflows/   Antigravity slash commands → .ai/playbooks
AGENTS.md            Root policy (outranks .ai/)
```

## How to use

1. Read [`AGENTS.md`](../AGENTS.md).
2. For non-trivial work, follow [`orchestrator.md`](./orchestrator.md) — it **infers** ship vs advise,
   entry playbook, and whether schema/API/architecture must chain. The user does not need to name them.
3. Load only the playbook + specialists the orchestrator names; continue the chain until the shipped
   result (or stop after Decide if mode is Advise).
4. Confirmation-list items: propose → wait → implement. Everything else: proceed.

**Cursor:** `00-global.mdc` + `05-orchestrator.mdc` always on; numbered rules attach by path.

**Antigravity:** optional shortcuts `/feature`, `/architecture`, `/schema-change`, `/ui-redesign`,
`/audit`, … under [`.agents/workflows/`](../.agents/workflows/). Autonomía vía orchestrator sin slash.
**Other tools:** point at `.ai/core/` + the relevant playbook.

## Non-negotiables

1. [`AGENTS.md`](../AGENTS.md) outranks `.ai/`.
2. `.ai/` is **derived**, never canonical — [`core/sources-of-truth.md`](./core/sources-of-truth.md).
3. Product docs live in [`circlesfera-documentation/`](../circlesfera-documentation/README.md); decisions in [`adr/`](../circlesfera-documentation/adr/README.md).

## Maintenance

- Keep files short; prefer paths over pasted snippets.
- Fix stale facts in the same PR as the code change.
- Adapters (`.cursor/`, `.agents/`) hold routing only — facts stay in `.ai/`.
- Section references: plain `section 9.4`, never the section symbol.
- Verified **2026-09-05**. Drift: [`core/known-gaps.md`](./core/known-gaps.md).
