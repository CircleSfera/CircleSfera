# ADR-0011: In-repository AI engineering framework under `.ai/`

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering
- **Scope:** engineering process / repository structure

## Context

Most CircleSfera development happens with AI coding tools (Cursor, Antigravity, cloud agents). The repo already had `AGENTS.md` defining operating rules, but nothing operational underneath it: no shared project context, no routing from a request to the right lens, no workflow, no closing gates. In practice each session re-derived the same facts from the codebase, sometimes wrongly, and produced inconsistent decisions across sessions.

The codebase is large enough that this matters: 65 Prisma models, 46 Nest modules, a React 19 SPA, Stripe Connect money flows, encrypted chat, moderation and GDPR obligations. Ad-hoc prompting on a surface that size reliably invents endpoints, models and enums that do not exist.

## Decision

Keep a versioned AI engineering framework in the repository at `.ai/`, with thin tool-specific adapters that route into it:

- `.ai/core/` — permanent project context: identity, principles, stack, architecture, conventions, quality bar, glossary, source-of-truth precedence, and known drift.
- `.ai/orchestrator.md` — classifies a request and selects the playbook and specialist roles.
- `.ai/agents/` — 24 specialist roles, each with a narrow scope and hard rules.
- `.ai/playbooks/` — 11 end-to-end workflows (feature, bug, incident, schema change, refactor, performance, security audit, UI redesign, dependency change, release, docs sync).
- `.ai/checklists/` — 9 gates that must hold before work is called done.
- `.ai/templates/` — skeletons for ADRs, PRDs, API contracts, migrations, postmortems, and for new agents and playbooks.
- `.cursor/rules/*.mdc` — Cursor rules that auto-attach the relevant `.ai/` files per file path.
- `.agents/rules/` and `.agents/workflows/` — the Antigravity equivalent, with the playbooks exposed as slash commands. Adapters contain routing only, never facts.

Precedence is explicit and unchanged: `AGENTS.md` outranks everything in `.ai/`, and `.ai/` is **not** a source of truth. `schema.prisma`, implemented code, API contracts and ADRs remain canonical in that order. Every `.ai/` file states what it derives from; when it disagrees with the code, the code wins and the file is corrected.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A collection of standalone prompt files | This is what the situation effectively was. Prompts share no context, drift apart, and cannot enforce a protocol. |
| Only `.cursor/rules/` | Locks the investment to one tool. Antigravity, Claude Code, Codex and cloud agents read plain markdown, so the substance belongs in `.ai/` with per-tool directories as thin adapters. |
| Expand `AGENTS.md` into one large document | `AGENTS.md` is loaded in full on every request. Growing it costs context on every task and mixes policy with operational detail. Layering keeps policy short and stable. |
| Put the context in `circlesfera-documentation/` | Those documents target humans and are dated snapshots. AI context needs different framing (what to grep, what not to touch, known drift) and a different update cadence. |
| Generate context from the code on demand | Attractive, but the expensive part is judgement — precedence, accepted debt, "do not fix this" — which cannot be generated from source. |

## Consequences

**Accepted costs.** The framework is documentation, so it can go stale, and a stale context file is worse than a missing one because agents trust it. Keeping it honest requires updating `.ai/` in the same PR as the code change it describes.

**Constraints this imposes.**

- No file in `.ai/` may contradict `AGENTS.md` or claim authority over `schema.prisma` and implemented code.
- Verified drift that is not being fixed goes in `.ai/core/known-gaps.md` with evidence and a risk note, and is removed by the PR that fixes it.
- Durable decisions are recorded as ADRs here, not as prose inside `.ai/`.
- Numeric claims in `.ai/` (model counts, versions, file counts) must be re-derivable from the repo.

**What this does not decide.** Whether other tools get their own adapter directories, whether any part of `.ai/` should later be generated from the schema, and whether framework staleness gets a CI check.

## Implementation anchors

- `.ai/README.md` — scope, precedence and maintenance policy
- `.ai/core/sources-of-truth.md` — the precedence table agents follow
- `.ai/core/known-gaps.md` — verified doc/code drift, deliberately not silently fixed
- `.cursor/rules/00-global.mdc`, `.cursor/rules/05-orchestrator.mdc` — always-on Cursor entry points
- `.agents/README.md` — Antigravity adapter, including the activation modes that must be set per clone
- `AGENTS.md` — the rules this framework operates under

## Revisiting

Supersede this if the framework is observably not followed (agents keep inventing facts it documents), if it becomes a maintenance tax larger than the inconsistency it removes, or if tooling gains a native, cross-vendor context mechanism that makes a repo-local directory redundant.
