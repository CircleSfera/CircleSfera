# Agent contract

The primary operational contract for AI agents working on CircleSfera. It is the framework's entry
point for behavior and governance — not a replacement for product documentation, ADRs, implementation
sources, specialists, playbooks, or checklists, and it stays intentionally compact:

- Authority definitions → [`authority.md`](./authority.md).
- Canonical vocabulary → [`terminology.md`](./terminology.md).
- Unresolved matters → [`deferred-decisions.md`](./deferred-decisions.md).
- Context acquisition rules → [`context-loading.md`](./context-loading.md).
- Detailed domain judgement → specialists (`.ai/agents/`).
- Detailed execution procedures → playbooks (`.ai/playbooks/`).
- Detailed verification → checklists (`.ai/checklists/`).

**Status:** target architecture per the Notion "Agent Engineering & Governance" specifications
(source of this file). `AGENTS.md`'s existing rules remain live and governing until a human explicitly
confirms the adapters (`AGENTS.md`, `.cursor/rules/`, `.agents/`) have been migrated to consume this
contract instead of restating their own precedence rules — see [`known-gaps.md`](./known-gaps.md) for
the tracked conflict.

## 1. Knowledge classes

Every agent must distinguish three knowledge classes. No class automatically overrides another
globally — authority is domain-specific (see `authority.md`).

- **Normative Knowledge** — what should be true: Principles & Values, Product Definition, Product
  Architecture, Product Boundaries, Product Specifications, Product Experience / Design System where
  applicable, approved ADRs.
- **Implementation Knowledge** — what is currently implemented: source code, `schema.prisma`,
  migrations, API contracts, configuration, infrastructure, package manifests.
- **Operational Knowledge** — how agents operate: this contract, the Authority/Terminology/Deferred
  Decisions/Context-Loading registries, the Drift register, specialists, playbooks, checklists,
  adapters.

## 2. Mandatory agent behavior

Before making a material change, an agent must:

1. understand the requested outcome;
2. load the minimum sufficient context;
3. identify relevant authority domains;
4. resolve canonical terminology;
5. inspect current implementation state where relevant;
6. identify conflicts or unresolved decisions;
7. determine its decision level (section 5);
8. assess impact;
9. act only within established authority;
10. validate the result;
11. synchronize affected documentation;
12. report evidence and unresolved issues.

Not every task requires every source or specialist — context must be proportional to the task (see
`context-loading.md`).

## 3. Authority boundary

This contract does not define the complete authority hierarchy — consult `authority.md` for
domain-specific authority. The governing rule it establishes here is:

> Never resolve a conflict by assuming that code, documentation, schema, or any other source
> universally wins. First determine which source is authoritative for the specific question.

## 4. Decision levels

Every material agent decision falls into one of four levels.

- **MAY DECIDE** — the agent may act autonomously: the decision is within an established rule or
  approved boundary, does not affect an immutable product decision or unresolved Deferred Decision,
  and can be safely validated. Examples: localized implementation details, safe refactoring within an
  approved boundary, routine test updates.
- **MAY RECOMMEND** — the agent may analyze and propose but must not silently establish a new durable
  rule. Examples: architectural alternatives, product behavior proposals, cross-module design choices,
  non-trivial UX changes.
- **MUST CONFIRM** — human confirmation is required before execution: product behavior/scope,
  immutable product decisions, unresolved Deferred Decisions, new architecture or material
  architecture changes, breaking API/external contracts, destructive or materially risky data
  changes, security/privacy/legal/financial boundaries, monetization behavior, capability removal,
  canonical terminology or authority-model changes.
- **MUST STOP** — the agent must stop and escalate: authoritative sources directly contradict each
  other with no resolution path, destructive/security-sensitive ambiguity, a required authority is
  unavailable, evidence is insufficient, a Deferred Decision would be silently resolved, the action
  would violate an immutable product decision, or the agent cannot establish a safe scope.

The full decision matrix and escalation procedure live in the dedicated Decision & Escalation
specification (Notion, not yet mirrored into `.ai/core/` as of this file's creation — this contract
establishes only the four levels and their triggers, not the full matrix, per the single-definition
rule in section 11).

## 5. Immutable CircleSfera decisions

Protected; changing any of these requires explicit human/product authority and, where appropriate, an
approved ADR.

- **Product Principles:** User Control, Algorithmic Transparency, No Hidden Suppression, Explainable
  Moderation, Responsible Data Handling.
- **Social Product Domains:** Identity, Social Relationships, Content, Discovery, Communication.
- **Canonical Product Model:** Identity • Relationships • Activity • Preferences • Content • Discovery.
- **Identity terminology:** Identity = User, Profile = Profile, one Identity per person, multiple
  Profiles may exist within the same Identity.

## 6. Deferred decisions

Consult `deferred-decisions.md` when a task intersects an unresolved matter. `DD-001` (Account Type
ownership: User vs. Profile) is **RESOLVED** — `Profile.accountType` (enum `PERSONAL`/`CREATOR`/
`BUSINESS`); `User` does not own an `accountType` field. The chain is:
`Identity → User → Profile → Profile.accountType → capabilities → permissions → monetization → administration`.
Retained in the registry for traceability; do not treat it as unresolved.

## 7. Conflict classification

When evidence conflicts, classify before acting:

1. **Documentation Drift** — documentation does not reflect intended or current state.
2. **Implementation Drift** — implementation does not conform to valid normative decisions.
3. **Decision Conflict** — authoritative decisions contradict one another.
4. **Ambiguous / Unknown** — evidence is insufficient to establish the correct interpretation.

The classification determines the next action; it does not itself authorize a change.

## 8. Context loading

Progressive: Level 0 (global contract) → Level 1 (task context) → Level 2 (specialist context) →
Level 3 (historical/supporting context). Load only what is necessary to make a safe decision;
re-verify primary sources when current state materially affects the decision. Freshness states: LIVE,
SNAPSHOT, HISTORICAL, UNKNOWN. Full protocol in `context-loading.md`.

## 9. Specialist / playbook / checklist separation

- **Specialist = Judgement** — domain expertise, reasoning, risk assessment, recommendations.
- **Playbook = Process** — execution lifecycle for a class of work.
- **Checklist = Verification** — evidence-oriented confirmation that required conditions were met.

All three consume this contract; none independently redefines it.

## 10. Single definition, multiple consumers

Define a rule once at its proper authority layer. Consumers reference, interpret, verify, or route to
it — never create a competing definition for convenience. Before creating a new rule, registry, or
document, check whether an existing source already owns the concern.

## 11. Change lifecycle

`Request → Understand → Classify → Ground in Authority → Assess Impact → Decide/Confirm → Plan →
Implement → Validate → Synchronize → Record → Close`. A governance model, not a mandatory linear
pipeline — task-specific playbooks may add or skip genuinely non-applicable steps, but may not bypass
the governing responsibility a skipped step represents.

## 12. Traceability and evidence

For every material change, produce evidence proportional to risk: what was requested, relevant
authority and context, applicable decision level, affected scope, what changed, how it was validated,
synchronization status, unresolved issues, closure state. Report **FACT** / **INFERENCE** / **PROPOSAL**
/ **DECISION** / **DEFERRED** distinctly. Never expose hidden chain-of-thought — traceability means
observable facts, sources, decisions, actions, and validation evidence, not reasoning transcripts.

## 13. Safe refactoring

Autonomous refactoring only when it stays within established authority and preserves required
behavior: scoped, reviewable, validated, reversible where practical, traceable. No broad cleanup merely
because code looks unused or imperfect if it could alter contracts, behavior, ownership, or hidden
dependencies. When uncertain, narrow scope or escalate rather than invent assumptions.

## 14. Documentation synchronization

Required when a change affects normative product documentation, architecture documentation,
implementation documentation, operational agent context, or QA specifications/validation records.
Identify affected consumers and ensure synchronization is completed, explicitly deferred, or blocked
before closure. Never rewrite normative product documentation merely to hide implementation drift.

## 15. Reporting contract

Distinguish **FACT** (directly established), **INFERENCE** (reasoned conclusion), **PROPOSAL**
(suggested, not approved), **DECISION** (approved/authorized), **DEFERRED** (intentionally
unresolved). Validation outcomes: **PASS**, **NOT RUN**, **NOT APPLICABLE**, **FAILED**, **PENDING**.
Never present a proposal or inference as a fact.

## 16. Adapter contract

`AGENTS.md`, `.agents/`, and `.cursor/rules/` are adapters: tool-specific routing, loading mechanics,
invocation syntax, environment-specific instructions. They must not independently redefine product
principles, product domains, the canonical product model, authority rules, decision levels, deferred
decisions, or global conflict rules. When an adapter conflicts with this contract, the adapter should
be corrected unless a higher-authority domain source explains the difference.

## 17. Prohibited agent behaviors

Agents must not: invent product requirements; silently resolve Deferred Decisions; treat stale
snapshots as current truth; apply a universal "code wins" or "documentation wins" rule; alter immutable
product principles without explicit authority; introduce "Communities" as a Social Product Domain;
reinterpret Identity/Profile terminology; create a parallel generic decision registry; duplicate global
policy unnecessarily across specialists/playbooks/checklists/adapters; broaden a change's scope without
justification; claim validation that was not performed; mark known drift resolved without evidence.

## 18. Relationship to other core files

```
agent-contract.md
    ├── authority.md
    ├── terminology.md
    ├── deferred-decisions.md
    ├── context-loading.md
    └── known-gaps.md

Project context
    ├── identity.md
    ├── architecture.md
    ├── stack.md
    ├── conventions.md
    ├── glossary.md
    └── quality.md
```

This contract governs behavior; it does not absorb the contents of these files.

## Governing principle

The Agent Contract defines how agents must operate; it does not become the place where every
CircleSfera fact, rule, or procedure is copied.
