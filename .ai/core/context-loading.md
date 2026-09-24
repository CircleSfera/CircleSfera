# Context loading

How agents acquire, prioritize, validate, and refresh project context. Consumed by
[`agent-contract.md`](./agent-contract.md), `.ai/orchestrator.md`, specialists, playbooks, checklists,
Antigravity, and Cursor. Goal: prevent stale, excessive, duplicated, or incorrectly authoritative
context from influencing implementation decisions.

## Core principle

**Load the minimum context required to make a safe decision, then verify primary sources when the
decision depends on current state.**

Context is not authority merely because an agent has loaded it. Distinguish: what the source says;
what is currently implemented; what has been decided; what remains unresolved; how fresh the
information is.

## Context classes

Three knowledge classes, defined in [`authority.md`](./authority.md):

- **Normative Context** — Principles & Values, Product Definition/Architecture/Boundaries/
  Specifications, Design System, Product Experience, approved ADRs. Required when changing product
  behavior, architecture, design behavior, or other governed intent.
- **Implementation Context** — `schema.prisma`, migrations, source code, API contracts/controllers/
  DTOs, package manifests, configuration, infrastructure, tests. Required when making or validating
  implementation changes.
- **Operational Context** — this contract, `authority.md`, `terminology.md`,
  `deferred-decisions.md`, this file, `known-gaps.md`, specialists, playbooks, checklists. Governs
  execution, not product intent.

## Progressive context loading

Don't load every available document by default.

- **Level 0 — Global Contract:** always establish `agent-contract.md`, `authority.md`, canonical
  terminology, relevant immutable principles, active deferred decisions affecting the task.
- **Level 1 — Task Context:** load only the relevant domain sources (product task → Product
  Definition/Architecture/Specifications; UI task → Product Experience/Design System; schema task →
  schema + migrations + relevant architecture; API task → API implementation/contracts + relevant
  specs; security task → security guidance + affected implementation + relevant normative
  requirements).
- **Level 2 — Specialist Context:** load a specialist only when its domain judgement is required — not
  every specialist for every task.
- **Level 3 — Historical / Supporting Context:** historical PRDs, snapshots, legacy documents, or
  prior decisions only when they provide useful evidence or traceability. Never silently overrides
  current authoritative sources.

## Primary-source verification

Derived `.ai/core` summaries are navigation and operational aids — not a substitute for primary
verification when precision matters. Verify the primary source when: the task changes implementation;
the information may have changed since the derived summary was verified; exact schema/code/API
behavior matters; dependency versions or infrastructure state matter; a conflict is detected; a
decision depends on current implementation state. Examples: `stack.md` → verify package manifests for
version-sensitive work; `architecture.md` → verify current source structure for architecture-sensitive
work; `glossary.md` → verify schema/code when mapping implementation terminology;
`sources-of-truth.md` → use `authority.md` and verify the relevant primary authority.

## Freshness states

Every derived operational context document should declare one of: **LIVE** (intended to reflect
current verified state) · **SNAPSHOT** (verified at a stated point in time) · **HISTORICAL** (retained
only for historical reference) · **UNKNOWN** (freshness cannot be established). A `SNAPSHOT` isn't
invalid merely because it's old — it becomes unsafe when the task depends on information that may have
changed since verification. `UNKNOWN` requires verification before relying on implementation-sensitive
claims.

Where practical, include: source path/document, source type, verification date, freshness state,
scope of the verified information, known limitations. The metadata is descriptive — it doesn't replace
checking the primary source when required.

## Context invalidation

A derived summary is potentially invalid when: its primary source changed materially; a related ADR
superseded its assumptions; Product Definition/Architecture/Boundaries changed; schema migrations
changed relevant models; major code restructuring occurred; terminology changed through an authorized
registry update; the verification date is no longer adequate for the task. Refresh affected context
rather than continuing to rely on stale summaries.

## Context conflict handling

If two loaded sources disagree:

1. stop treating either summary as automatically correct;
2. classify the information by knowledge type;
3. consult `authority.md`;
4. check relevant ADRs;
5. check `deferred-decisions.md`;
6. verify primary sources as required;
7. classify as Documentation Drift, Implementation Drift, Decision Conflict, or Ambiguous/Unknown;
8. continue only if the work can safely proceed without resolving the conflict.

Context loading must never hide an authority conflict.

## Context vs. authority boundary

Loading a document does not make it authoritative. `authority.md` determines authority by question and
domain; this file determines how relevant context is acquired and refreshed. `terminology.md`
determines canonical terminology; this file determines when terminology context is needed.
`deferred-decisions.md` determines unresolved matters; this file only identifies and loads decisions
relevant to the task. `agent-contract.md` defines mandatory agent behavior; this file does not create
new agent permissions. ADRs record approved durable decisions; cached references to them don't create
authority by themselves. No context file is promoted to authority merely because it's newer, easier to
access, or more detailed than the primary source.

## Current-state verification matrix

| Task dependency | Minimum primary verification |
| --- | --- |
| Product intent or required behavior | Relevant canonical product document/specification |
| Architectural decision | Relevant approved ADR and affected architecture |
| Database structure | Current `schema.prisma` and relevant migrations |
| Implemented behavior | Current source code and affected tests |
| API behavior or contract | Current controllers/DTOs/contracts and relevant implementation |
| Dependency or version state | Current package manifests and lockfiles |
| Runtime/infrastructure state | Current configuration and infrastructure definitions |
| Terminology with architectural meaning | `terminology.md` plus affected authoritative source |
| Deferred decision | `deferred-decisions.md` plus its cited evidence |

Derived summaries are for navigation and initial orientation — not the sole basis for a current-state
change when the affected primary source is available.

## Specialist / playbook / checklist loading rules

- **Specialist** — load when the task requires domain-specific reasoning the core contract and task
  context don't safely cover (e.g. database specialist for schema/model/migration decisions, security
  specialist for threat implications). Must consume authoritative context, not establish independent
  product truth.
- **Playbook** — defines process, not authority. Select by work type (feature, bug, refactor,
  schema-change, incident, performance, security-audit, UI redesign, dependency upgrade, release,
  documentation sync). Determines required process steps and conditional context; does not override
  `authority.md`.
- **Checklist** — a verification instrument, normally loaded near the validation stage. Must not
  become a hidden source of product or architecture decisions — a rule that should govern all agents
  belongs in the authoritative framework component, referenced here rather than redefined.

## Historical context rules

Historical material may explain why a decision was previously considered, how the system evolved, why
legacy terminology exists, or what a previous implementation contained. It must not be used as current
authority unless an authoritative source explicitly preserves it. When historical and current context
differ, label the distinction explicitly.

## Context reporting

When context materially affects a decision, report **FACT** / **INFERENCE** / **PROPOSAL** /
**DECISION** / **DEFERRED** per `agent-contract.md` section 15 — this prevents inferred or proposed
context from being presented as established project truth.

## Context synchronization

When a primary source changes: identify affected derived context; determine whether it's now stale;
update or invalidate the derived source; update verification metadata; record material drift where
appropriate; avoid changing unrelated operational context. Synchronization must not silently alter
normative product intent, resolve a Deferred Decision, or rewrite canonical terminology. If a primary
change creates a material conflict rather than simple drift, route it through the conflict/decision
workflow instead of normalizing it via synchronization.

## Context budget

Optimize for relevance and correctness, not maximum context volume. Large context loads risk: stale
information mistaken for current; duplicate rules with different wording; terminology drift;
conflicting instructions; unnecessary specialist activation; reduced ability to identify the
authoritative source. Route work through the smallest sufficient context set.

## Governing principle

Context exists to help an agent reach a correct decision; it must never become an accidental
substitute for authority.
