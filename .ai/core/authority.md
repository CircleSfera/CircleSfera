# Authority registry

Defines where authority comes from, how it is scoped by question/domain, and how conflicts are
classified and resolved. Answers **which source governs this fact or decision** — it does not grant
permission to act; decision authority is [`agent-contract.md`](./agent-contract.md) section 4.

**Status:** target model. `AGENTS.md`'s current "Fuente de verdad" section states a single linear
precedence (`schema.prisma → código implementado → contratos API vigentes → ADRs →
circlesfera-documentation/ → suposiciones`) and an explicit "fix documentation, not the system" rule.
That is a live, currently-governing document contradicting the domain-scoped model below — a Decision
Conflict, not silently resolved in either direction (tracked in [`known-gaps.md`](./known-gaps.md)).
Until a human explicitly approves migrating `AGENTS.md` to this model, `AGENTS.md`'s rules govern.

## Core model

CircleSfera has three distinct knowledge classes — see `agent-contract.md` section 1 for the
authoritative definition and examples. None is a universal replacement for the others.

## Authority domains

- **Product Authority** — Principles & Values, Product Definition, Product Architecture, Product
  Boundaries, Product Specifications, approved product-related ADRs. Defines what CircleSfera is
  intended to be and what product behavior is authorized.
- **Design Authority** — Design System, Product Experience, approved design decisions. Visual
  language, interaction patterns, responsive behavior, accessibility, presentation rules.
- **Architecture Decision Authority** — approved ADRs. An ADR is authoritative for the decision it
  explicitly records; it does not automatically override unrelated product or implementation facts.
- **Implementation Authority** — domain-specific: `schema.prisma` + migrations (database), source
  code (software behavior), API contracts/controllers/DTOs (exposed contract), configuration/
  infrastructure (runtime state), package manifests/lockfiles (dependency state). Answers "what
  exists now," not "what should exist."
- **Operational Authority** — this contract, this registry, `terminology.md`,
  `deferred-decisions.md`, specialists, playbooks, checklists. Must not silently redefine normative
  product intent or implementation truth.

## Authority by question

| Question | Primary authority |
| --- | --- |
| What is CircleSfera intended to be? | Product Authority |
| What product behavior is required? | Product Specifications |
| What are the immutable product principles? | Principles & Values |
| What product domains exist? | Product Architecture / Product Boundaries |
| How should an interaction look or behave? | Design Authority |
| What architectural decision was approved? | ADR |
| What does the database currently implement? | `schema.prisma` + migrations |
| What does the code currently implement? | Source code |
| What API contract currently exists? | Current API implementation/contracts |
| How should an agent execute work? | `agent-contract.md` + relevant playbook |
| What terminology is canonical? | `terminology.md` |
| What decision is intentionally unresolved? | `deferred-decisions.md` |

No source is authoritative outside its defined question without this classification step.

## Source precedence rules

Precedence is domain-scoped, not globally hierarchical.

1. **Classify the fact type first** — product intent, architecture decision, design behavior,
   implementation state, operational instruction, terminology, or unresolved decision.
2. **Use the authority appropriate to that fact type.** Don't use implementation state to silently
   redefine product intent. Don't use product documentation to claim an implementation exists when it
   doesn't. Don't use operational instructions to override an approved product/architecture decision.
3. **Approved decisions constrain implementation.** When an ADR exists for the affected architectural
   decision, implementation must conform unless a newer authorized decision supersedes it.
4. **Current implementation describes reality, not intent.** When code/schema differs from canonical
   product or architecture documentation, classify the difference — don't automatically "fix" either
   side.
5. **Deferred decisions block silent resolution.** When the disputed matter is an active Deferred
   Decision, follow its defined temporary behavior. Resolved ones are not active blockers, but stay
   traceable.

## Conflict classification

1. **Documentation Drift** — implementation is correct/current, documentation is stale/inaccurate.
   Action: update documentation through the normal synchronization process.
2. **Implementation Drift** — the normative source is still authoritative, implementation doesn't
   conform. Action: treat implementation as a candidate defect/remediation item; don't rewrite
   normative documentation to legitimize the drift.
3. **Decision Conflict** — two authoritative sources prescribe incompatible outcomes, or a new
   product/architecture decision is required. Action: stop autonomous resolution, escalate; use an
   ADR where appropriate.
4. **Ambiguous / Unknown** — evidence is insufficient. Action: gather authoritative evidence; if the
   ambiguity is an intentionally-unresolved decision, register or reference a Deferred Decision.

## Conflict resolution protocol

When an agent detects a material conflict:

1. identify the exact conflicting claims;
2. classify each claim by knowledge type;
3. identify the authority for each claim;
4. determine drift, decision conflict, or ambiguity;
5. check `deferred-decisions.md`;
6. check relevant ADRs;
7. assess whether work can safely continue without resolving the conflict;
8. if safe, continue while preserving and reporting the conflict;
9. if unsafe or decision-dependent, stop and escalate;
10. synchronize affected sources only after the correct authority is established.

Never hide a conflict by changing whichever source is easiest to edit.

## Schema authority boundary

`schema.prisma` is authoritative for the current database implementation. It is **not** automatically
authoritative for product terminology, product boundaries, product principles, conceptual product
architecture, or unresolved product decisions. Conversely, product documentation must not be used to
claim a database field, relation, constraint, or migration exists when the current schema doesn't
implement it.

## Operational context freshness

Every derived `.ai/core` summary should declare freshness where practical: **LIVE** (intended to
reflect currently verified state), **SNAPSHOT** (verified at a specific date, potentially stale),
**HISTORICAL** (retained for historical context only), **UNKNOWN** (freshness cannot be established).
Don't treat a stale snapshot as live truth when the task depends on the affected information — verify
the primary implementation source instead.

## Agent decision boundaries

Summary; full model in `agent-contract.md` section 4.

- **MAY DECIDE** — no normative decision affected, no Deferred Decision involved, stays within
  established architecture/conventions, reversible and low risk.
- **MAY RECOMMEND** — a product/architecture/design/implementation choice requires judgement but
  final authority hasn't been delegated. Label recommendations as recommendations, not decisions.
- **MUST CONFIRM** — changes product behavior beyond approved specs, changes architectural
  boundaries, modifies immutable principles/domains, resolves a Deferred Decision, creates
  significant compatibility/financial/security/legal/data-integrity consequences, or supersedes an
  approved ADR.
- **MUST STOP** — the applicable authority can't be determined, or proceeding would silently resolve
  a material conflict.

## Documentation synchronization rules

Synchronization is not the same as correction. Before changing a document, determine whether it is
normative, derived, historical, implementation documentation, or operational guidance. A derived or
operational document may be updated to reflect verified current truth. A normative document may only
change when the underlying product/architecture decision itself changed, or to restore its intended
authoritative meaning. An implementation document may be synchronized with actual code/schema state
without changing the underlying product decision.

## Relationship to other framework components

`agent-contract.md` consumes this registry for authority and conflict behavior. `terminology.md`
governs terminology. `deferred-decisions.md` governs unresolved matters. ADRs record approved durable
decisions. Specialists apply domain judgement within these boundaries; playbooks operationalize the
workflow; checklists verify compliance. Adapters (`AGENTS.md`, `.agents/`, `.cursor/rules/`) route to
these rules rather than redefine them. This registry is a foundation, not another parallel
documentation hierarchy.

## Governing principle

Authority follows the type of truth being established; no single source is universally authoritative
for every question.
