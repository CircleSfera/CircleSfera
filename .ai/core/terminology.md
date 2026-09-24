# Canonical terminology registry

Canonical terminology every CircleSfera agent, document, and workflow must use. Governs terms whose
consistency materially affects product meaning, architecture, agent decisions, or cross-document
interpretation — it is not a general glossary (that's [`glossary.md`](./glossary.md)).

Product terminology follows current canonical product documentation and approved ADRs. Implementation
names may differ where the existing codebase requires it, but agents must explicitly distinguish
product terminology from implementation terminology. This registry does not redefine product concepts
merely because an implementation currently uses a different name.

## Canonical product principles

Immutable names — do not introduce alternates ("User Control First", "Strict and Explicit
Moderation", "Data Responsibility" are forbidden drift, not synonyms):

1. **User Control**
2. **Algorithmic Transparency**
3. **No Hidden Suppression**
4. **Explainable Moderation**
5. **Responsible Data Handling**

## Social Product Domains

1. **Identity**
2. **Social Relationships**
3. **Content**
4. **Discovery**
5. **Communication**

**"Communities" is not a Social Product Domain.** Do not introduce it as one when summarizing or
restructuring CircleSfera product architecture.

## Canonical product model

**Identity • Relationships • Activity • Preferences • Content • Discovery**

Do not replace with alternative sequences (e.g. "Persona → Identity → Relationships → Communities").

## Identity and Profile terminology

| Concept | Canonical meaning | Implementation note |
| --- | --- | --- |
| Identity | The person/account identity | Current implementation: `User` |
| Profile | A product-facing profile context belonging to an Identity | Current implementation: `Profile` |
| Account Type | Product capability context associated with a Profile | `Profile.accountType`, enum `AccountType` |
| Personal | Current Personal account type | Follow current schema |
| Creator | Current Creator account type | Follow current schema |
| Business | Current Business account type | Follow current schema |

One Identity may contain multiple Profiles. Account Types are contexts within the product model, not
separate products.

## Account Type implementation mapping

Verified against current `schema.prisma` (2026-09-24): `Profile.accountType` uses enum `AccountType`
(`PERSONAL`, `CREATOR`, `BUSINESS`); `User` does not own an `accountType` field. Account Type is
therefore a Profile-level context, `User` represents the underlying Identity. See
[`deferred-decisions.md`](./deferred-decisions.md) `DD-001` for the historical resolution record.

## Content terminology

Known implementation mappings — navigation aids, not permission to redesign the data model:

- **Frame** — product concept implemented via `Post` with `PostType.FRAME`; no separate `Frame` model.
- **Story** — the `Story` model.
- **Payout** — product/business concept; don't assume a dedicated Prisma payout table without
  inspecting the current schema.
- **Plan / Tier** — platform subscription concept; current implementation uses `PlatformPlan` rows,
  not a fixed enum.
- **Purchase** — product/payment concept; don't assume a dedicated Prisma `Purchase` model without
  inspecting the current schema.

## Terminology rules for agents

1. Use canonical product terms in product-facing explanations and documentation.
2. Use implementation terms when referring to concrete code/schema structures.
3. When the terms differ, state the mapping explicitly.
4. Do not silently rename implementation concepts to make them appear compliant.
5. Do not silently redefine product concepts based on implementation naming.
6. Do not introduce synonyms as new canonical terminology.
7. Preserve capitalization of immutable canonical names where used as formal labels.
8. When an ambiguous term appears, inspect the relevant authoritative source before deciding what it
   means.

## Forbidden terminology drift

Flag rather than silently normalize:

- "Community" as a core Social Product Domain.
- "User Control First" as a replacement for **User Control**.
- "Explicit Moderation" (or similar) as a replacement for **Explainable Moderation**.
- "Data Responsibility" as a replacement for **Responsible Data Handling**.
- "Persona" as a new identity-layer concept.
- "Account" used ambiguously where the Identity/User/Profile/Account Type distinction matters.

## Registry entry format

For new entries, use: Canonical Term, Definition, Domain, Allowed implementation mappings, Forbidden/
misleading alternatives, Authority source, Status, Last verified, Freshness (LIVE / SNAPSHOT /
HISTORICAL / UNKNOWN).

## Relationship to other core files

This file governs canonical vocabulary and explicit product-to-implementation mappings only. It does
not absorb source precedence (→ `authority.md`), unresolved decisions (→ `deferred-decisions.md`),
context acquisition/freshness procedures (→ `context-loading.md`), or general implementation
vocabulary (→ `glossary.md`). Specialists, playbooks, checklists, `AGENTS.md`, `.agents/`, and
`.cursor/rules/` should consume this registry rather than maintain competing terminology lists.

## Maintenance

Changes to immutable product terminology require explicit product authority — not routine
implementation cleanup. Implementation mappings may evolve as the codebase evolves; update this
registry and relevant documentation without changing the canonical product concept unless that change
is explicitly approved.
