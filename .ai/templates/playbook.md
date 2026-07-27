# Playbook — <name>

<!--
Add a playbook only for a recurring workflow that the existing ones do not cover. Then add a row to
.ai/playbooks/README.md and a routing row to .ai/orchestrator.md.
Every playbook is a specialization of the mandatory protocol in .ai/orchestrator.md.
-->

Specialists: `<first>` → `<second>` → `<third>`.

Use this when: <the trigger condition, specific enough to distinguish it from the other playbooks>.

## 1 — <Understand>

What must be established before anything else. Include the stop condition: what makes you ask instead
of proceeding.

## 2 — <Ground>

The exact artifacts to read, by path. Reading is not optional — every later claim must trace to
something read here.

## 3 — <Assess impact>

What else this class of change tends to affect in this codebase: schema, migrations, API contract, auth
and permissions, cache keys, queues, socket events, i18n keys, tests, docs, money flows.

## 4 — <Decide>

What to present before implementing, including the options and the trade-off. Name anything on the
`AGENTS.md` confirmation list that requires waiting.

## 5 — <Implement>

Order of operations. Explicit constraints on scope creep.

## 6 — <Verify>

The exact commands, and what to check manually. Real output is required; asserting an unrun check is
prohibited.

```bash
# commands relevant to this workflow
```

## 7 — <Report>

The deliverable shape: what changed, what was verified how, what is deferred, what risk remains.
Verified fact, inference and proposal separated.

## Close with

The applicable checklists from `.ai/checklists/`.

## Hard rules

- Never …
