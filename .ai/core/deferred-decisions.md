# Deferred decisions registry

**Source:** Notion "Agent Engineering & Governance" — Deferred Decisions Registry Specification.
**Verified:** 2026-09-24.

Canonical registry for unresolved decisions that are **intentionally not decided yet**. Not a design
preference, a backlog item, a bug, or an undocumented decision — an explicitly acknowledged unresolved
matter agents must not silently choose an outcome for.

- **ADR** = an approved decision. Records what has been decided and why.
- **Deferred Decision** = an unresolved matter. Records what has deliberately not been decided and
  what agents must do until it is.

An ADR may close a Deferred Decision. A Deferred Decision must never be treated as an ADR. This
registry is **Operational Knowledge** — it does not create product, architecture, design, or
implementation authority; it records unresolved matters governed by the appropriate authoritative
source when eventually decided (product decisions → Product Authority, design → Design Authority,
architecture → ADR, implementation → the relevant Implementation Authority — see
[`authority.md`](./authority.md)). If an item crosses multiple authority domains, no single agent
resolves it alone.

## Statuses

Every item has exactly one: **OPEN** (unresolved, actively relevant) · **ACKNOWLEDGED** (unresolved,
understood, intentionally retained without immediate action) · **DEFERRED** (postponed until a
defined condition/milestone/review) · **IN PROGRESS** (decision process underway, no final decision
yet) · **RESOLVED** (final decision made, linked to the resulting ADR/authoritative record) ·
**CANCELLED** (no longer required; underlying scope removed).

`OPEN`, `ACKNOWLEDGED`, and `DEFERRED` are never permission for an agent to choose an outcome
autonomously.

## Required fields per entry

ID · Title · Status · Domain (Product / Design / Architecture / Implementation / Security / Data /
Cross-Domain) · Decision Required · Current State · Known Constraints · Evidence/Sources · Impact ·
Agent Behavior (may/may not/must) · Resolution Authority · Trigger/Review Condition · Related ADR or
authoritative record (required once resolved) · Last Verified.

## Agent behavior while unresolved

**MUST:** recognize the item as unresolved; preserve current implementation unless an independently
authorized change is required; avoid inventing a final product/architecture decision; distinguish
facts from assumptions and proposals; report material impact when requested work touches the deferred
area; escalate when work can't be completed safely without deciding the matter.

**MAY:** inspect current implementation; document current state; identify consequences of each
plausible option; prepare implementation alternatives; recommend an option when explicitly asked;
perform changes that don't require resolving the deferred decision.

**MUST NOT:** silently convert an implementation detail into a product decision; rewrite canonical
product documentation to match an unresolved implementation state; create an ADR claiming an
unapproved decision; remove a deferred item because it's inconvenient; infer that current code is
automatically the intended final architecture.

## Escalation triggers

Stop and request human confirmation when: the change requires choosing between unresolved
product/architecture alternatives; it would create an irreversible or high-cost commitment; two
authoritative sources conflict beyond ordinary drift; the item affects security, financial
correctness, legal obligations, data integrity, or user-visible contractual behavior; compatibility
can't be preserved without selecting an unresolved outcome. Otherwise, proceed with safe work and
explicitly record the deferred dependency in the report.

## Registry

### DD-001 — Account Type Ownership: User vs. Profile

- **Status:** RESOLVED
- **Domain:** Cross-Domain — Product Architecture / Data Model
- **Decision Required (historical):** whether Account Type is owned at the Identity/User level or the
  Profile level, reconciling product model with implementation without weakening the established
  Identity/Profile architecture.
- **Current State:** the canonical product model treats Identity = `User`, Profile = `Profile`, one
  Identity may have multiple Profiles. Account Types: Personal, Creator, Business.
- **Known Constraints:** Identity/Profile terminology is canonical; one Identity may have multiple
  Profiles; Account Types are product contexts, not separate products; `schema.prisma` is the
  implementation source of truth for the database; the conceptual model must not be rewritten to match
  the schema.
- **Resolution:** Account Type is owned by the **Profile** level, both conceptually and technically.
  `Profile.accountType` (enum `AccountType`: `PERSONAL`, `CREATOR`, `BUSINESS`) is the implementation
  field. `User` represents the underlying Identity and does not own an `accountType` field. Chain:
  `Identity → User → Profile → Account Type → capabilities → permissions → monetization → administration`.
- **Agent Behavior:** treat the Identity/User/Profile/Account Type mapping as resolved current
  architecture. Continue distinguishing the canonical product term **Identity** from its
  implementation entity `User`, and **Account Type** from the concrete `Profile.accountType` field.
- **Resolution Authority:** current Prisma implementation verification together with the established
  canonical product model.
- **Trigger / Review Condition:** reopen only if an explicitly authorized product or architecture
  change proposes a different ownership model.
- **Related ADR:** none — resolved by synchronizing terminology with the verified implementation
  state; create an ADR only if a future architectural change requires one.
- **Last Verified:** 2026-09-24 (re-verified against current `schema.prisma`; matches the 2026-09-13
  original resolution).

## What does not belong here

Not a generic issue tracker. Do not add: ordinary bugs; implementation tasks; stale documentation that
just needs synchronization ([`known-gaps.md`](./known-gaps.md) instead); feature requests with no
unresolved decision; known gaps with an obvious owner and remediation path; rejected proposals;
historical decisions already captured by ADRs. A matter belongs here only when the correct outcome is
**intentionally unresolved** and agents need explicit instructions for how to behave until it's
decided.

## Resolution protocol

1. Confirm the decision through the appropriate authority.
2. Create or update the authoritative record — normally an ADR for architecture decisions.
3. Update affected Product/Design/Technical/QA documentation as required.
4. Update implementation and tests where applicable.
5. Change status to `RESOLVED` or `CANCELLED`.
6. Add the resulting ADR or authoritative reference.
7. Update `Last Verified`.
8. Remove obsolete agent restrictions only after the authoritative decision is available.

Preserve historical traceability — resolved entries are not deleted merely because they're inactive.

## Maintenance and freshness

This is a live registry; every entry needs a meaningful `Last Verified` date. When an agent encounters
an item whose current state, sources, or implementation context may have changed materially, verify
the relevant sources before relying on the entry. A stale entry gets marked for review, not treated as
current truth. Keep the registry intentionally small — if it grows substantially, review each entry to
determine whether it's genuinely an unresolved decision or belongs in another tracking mechanism.
