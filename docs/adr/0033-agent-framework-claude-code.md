# ADR-0033: Agents carry a backlog item to production through Claude Code commands, agents and a guard hook

- **Status:** Accepted
- **Date:** 2026-11-21
- **Deciders:** CircleSfera owner, CircleSfera engineering
- **Scope:** engineering process / repository structure
- **Supersedes:** [ADR-0011](./0011-ai-engineering-framework.md)

## Context

ADR-0011 chose a framework of context files under `.ai/`, with adapters for each tool. It was
removed on 2026-09-28 to be rebuilt from scratch. Meanwhile the project's knowledge moved to Notion
and the rules for agents to `AGENTS.md`, so a second copy of the project's context in the
repository is no longer needed. What was missing was the procedure: how an agent takes one item of
the Implementation Backlog to production without a person driving each step, and what stops it
from doing what `AGENTS.md` forbids.

The owner's goal (2026-11-19): agents develop CircleSfera end to end, within `AGENTS.md` and its
confirmation list. Decided by the owner on the same day: agents merge their own pull requests
through the merge queue, and the work runs interactively, started by the owner, for now.

## Decision

The framework is procedure, not context. It lives in `.claude/` and `scripts/`, built for Claude
Code:

- `.claude/commands/next-item.md` — `/next-item` takes the next READY backlog item (Notion) to
  production: pick, plan, build in the single working folder `../CircleSfera-work`, check, pull
  request, merge queue, deploy, health, backlog updated, report. Items that need the owner are set
  to BLOCKED with the question, never built. `/loop /next-item` keeps going.
- `.claude/agents/` — four specialists with narrow scopes: `backend-dev`, `frontend-dev`, `docs`
  (corrects the Notion pages a change made untrue) and `reviewer` (read-only; required for
  authentication, authorization, money, personal data or production; given the diff, never the
  author's conclusion).
- `.claude/hooks/guard.mjs`, wired in `.claude/settings.json` as a `PreToolUse` hook — refuses,
  before the call runs, the common mistakes that an instruction alone does not prevent: force
  pushes, pushes to `main`, skipped hooks, admin merges, AI attribution in commits and pull
  requests, and a file tool or a command that names an environment file. It matches text, so it is
  a safety net, not a sandbox: a name the shell builds (`f=.e''nv`) is not caught, and the rule in
  `AGENTS.md` still applies. Its rules are tested in `.claude/hooks/guard.test.mjs`.
- `scripts/agent-check.mjs` — the checks CI runs, in one command, ending with "Every check passed".

`AGENTS.md` stays the authority; where a command and `AGENTS.md` differ, `AGENTS.md` wins. Facts
about the product and the system are read from Notion and the code, never restated in `.claude/`.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Rebuild `.ai/` as ADR-0011 described | Duplicates Notion and the code; a stale context file misleads agents more than a missing one. |
| Instructions only, in `AGENTS.md` | An instruction can be missed; a force push or a secret read must be refused by the tool, which the hook does. |
| A scheduled agent with no person present | Decided later; for now the owner starts each run. |
| Adapters for several tools | Only Claude Code is used. Another tool gets its own adapter when it is used. |

## Consequences

- One pull request per item, merged by the merge queue with every required check green. A pull
  request that changes `.github/workflows/` is still merged by the owner.
- The confirmation list of `AGENTS.md` is enforced by the procedure (BLOCKED items), not by the
  hook; the hook covers only the irreversible or secret cases.
- `guard.test.mjs` is not run by CI yet; a change to `guard.mjs` runs it by hand
  (`node --test .claude/hooks/guard.test.mjs`).
- First run end to end: the shared Redis module (#1110), 2026-11-21.

## Revisiting

Revisit when runs are scheduled without the owner present, when agents are allowed to merge
workflow changes, or when a second tool needs its own adapter.
