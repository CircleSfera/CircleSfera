# Known gaps and drift register

The live operational register for documentation, implementation, terminology, authority, freshness,
and cross-tool conflicts — the runtime artifact for the Documentation Drift & Conflict Register
described in [`authority.md`](./authority.md). Not a Deferred Decision registry (that's
[`deferred-decisions.md`](./deferred-decisions.md) — use it when the *correct outcome itself* is
intentionally unresolved, not when something is merely inconsistent or stale) and not a generic task
tracker (ordinary bugs, feature tasks, and engineering tickets stay in their normal tracking systems).

**Freshness:** SNAPSHOT, re-verified **2026-09-24** against the current repository state (previous
verification: 2026-09-05). Entries below carry their own `Last Verified` date where it differs.

**How to use this file:** if your task touches an entry, mention it. If your task *is* an entry, fix
it deliberately with tests/evidence, update its status, and remove it only once genuinely resolved —
in the same PR that fixes it. Do not batch unrelated fixes into one entry's resolution.

## Statuses

**OPEN** (identified, needs attention) · **ACKNOWLEDGED** (known, intentionally retained) ·
**IN PROGRESS** (remediation/investigation underway) · **DEFERRED** (intentionally postponed — not
the same as a Deferred Decision unless the matter itself requires an unresolved decision) ·
**RESOLVED** (corrected or formally accepted) · **WONT FIX** (reviewed, intentionally retained) ·
**INVALID** (not substantiated).

## Categories

Documentation Drift · Implementation Drift · Terminology Drift · Freshness · Authority ·
Agent Framework · Traceability · Other.

## Agent Framework / Authority

### GAP-001 — Global source-of-truth rule is overly broad

- **Status:** RESOLVED
- **Category:** Authority / Agent Framework
- **Evidence (original):** `AGENTS.md:11-20` ("Fuente de verdad") stated a single linear precedence —
  schema.prisma → código implementado → contratos API vigentes → ADRs → circlesfera-documentation/ →
  suposiciones. `AGENTS.md:88-89` and `:116` stated "si el sistema contradice la documentación,
  corregir la documentación, no el sistema" without domain qualification.
- **Expected State:** authority determined by knowledge type and question, per `authority.md`'s
  domain-scoped model — no universal "code wins" / "documentation wins" rule.
- **Resolution:** `AGENTS.md`'s "Fuente de verdad", "Documentación", and "Instrucción final" sections
  now point to `authority.md`'s domain-scoped model and 4-class conflict classification instead of
  stating a linear precedence or an unqualified "fix documentation" rule. Explicit human confirmation
  was obtained before this change, per `agent-contract.md`'s MUST CONFIRM trigger for a new
  architectural pattern.
- **Owner:** n/a.
- **Last Verified:** 2026-09-24.

### GAP-002 — Blanket rule duplicated into adapters

- **Status:** RESOLVED
- **Category:** Agent Framework
- **Evidence (original):** `.agents/workflows/docs-sync.md:28`, `.ai/playbooks/docs-sync.md:3`, and
  `.cursor/rules/80-docs.mdc:7-8` all restated GAP-001's blanket rule verbatim (the playbook
  explicitly citing it as "the governing rule from AGENTS.md"). The Cursor adapter was missed in the
  initial Batch 0 scan and found only via CodeRabbit review on PR #107 — Batch 0's grep pass covered
  `00-global.mdc`/`05-orchestrator.mdc` in full and the numbered domain rules by grep only, and this
  particular hit fell through.
- **Expected State:** adapters and playbooks consume the Authority Registry rather than independently
  redefining conflict-resolution policy.
- **Resolution:** all three files now reference `.ai/core/authority.md`'s four conflict classes
  instead of the blanket rule. Fixed together with GAP-001 to avoid leaving any file citing a rule
  that no longer exists in `AGENTS.md`.
- **Owner:** n/a.
- **Last Verified:** 2026-09-24.

### GAP-003 — Canonical product terminology drift

- **Status:** RESOLVED
- **Category:** Terminology Drift
- **Evidence (original):** `.ai/core/identity.md:30` named the fourth product principle "Strict and
  explicit moderation" — close to "Explicit Moderation," a variant [`terminology.md`](./terminology.md)
  explicitly forbids as a replacement for the canonical **Explainable Moderation**. Minor case-only
  drift was also present at `identity.md:22,25,32-33`.
- **Expected State:** the five canonical principle names, exactly as `terminology.md` states them.
- **Resolution:** `identity.md`'s five principles now read **User Control**, **Algorithmic
  Transparency**, **No Hidden Suppression**, **Explainable Moderation**, **Responsible Data
  Handling** — exact match to `terminology.md`, with an explicit pointer added so future edits don't
  drift again.
- **Authority / Resolution Path:** Batch 3 (Normalize Existing Core Context).
- **Owner:** n/a.
- **Last Verified:** 2026-09-24.

### GAP-004 — Specialist module-count inconsistency

- **Status:** RESOLVED
- **Category:** Freshness / Documentation Drift
- **Evidence (original):** `.ai/agents/api.md:32` stated "46 modules"; `.ai/agents/staff-architect.md:19`
  stated "~51 Nest feature modules" — neither carrying a freshness state or verification date. This gap
  was already open at 2026-09-11 (per the originating spec, then citing "41 and 46") and had since
  drifted further apart rather than closing.
- **Expected State:** implementation-sensitive counts either come from a current verified source or
  are explicitly labeled SNAPSHOT with a date, per `context-loading.md`'s freshness rules.
- **Resolution:** re-counted directly (`find circlesfera-backend/src -name "*.module.ts" -not -name
  "*.spec.ts" -not -name "app.module.ts"`) → **57** feature modules as of 2026-09-24. Both files now
  state this count with an explicit SNAPSHOT declaration and the exact, reproducible command used, so
  the next drift is self-evident instead of silent.
- **Owner:** n/a.
- **Last Verified:** 2026-09-24.

## Backend

### B6 — No repository layer, no mappers, no domain event bus

- **Status:** RESOLVED (accepted architecture, not a defect)
- **Category:** Implementation Drift (false positive — documented by design)
- **Evidence:** `rg Repository` in `src/` finds none.
- **Expected State:** N/A — this is the accepted architecture, not a deviation from one.
- **Observed State:** Prisma is injected directly by domain services; no repository/DAO/mapper layer
  exists anywhere in the backend.
- **Impact:** none — listed so agents stop proposing a repository layer as a fix for something that
  isn't broken.
- **Authority / Resolution Path:** formalized in [ADR-0021](../../circlesfera-documentation/adr/0021-global-prisma-access-transactional-discipline.md)
  (global Prisma access, transactional discipline).
- **Owner:** n/a.
- **Last Verified:** 2026-09-24.

### B7 — `StoriesService.getReactions` exposes the full `User` record, unauthenticated

- **Status:** RESOLVED
- **Category:** Implementation Drift
- **Evidence (original):** `circlesfera-backend/src/stories/stories.service.ts` — `getReactions` did
  `include: { profile: { include: { user: true } } }` and returned the raw joined object
  (`StoryReactionWithUser`), same shape `getViews` used before DATA-003 (PR #108). `GET
  /stories/:id/reactions` in `stories.controller.ts` carries no auth guard.
- **Expected State:** only public-safe fields returned (no password hash, tokens, email, IP hashes),
  per the same standard `getViews` was brought to in PR #108 — see
  [ADR-0022](../../circlesfera-documentation/adr/0022-pagination-and-high-volume-query-policy.md).
- **Resolution:** checked `StoryViewer.tsx` before deciding the fix shape — `getReactions` is fetched
  unconditionally for *every* viewer (not owner-gated), because each viewer needs it to compute their
  own "did I already like this" heart-fill state (`reactions.some(r => r.profileId === profile?.id...
  )`); only the *rendered list* of reactors is owner-gated in the UI. Restricting the endpoint to the
  owner, like `getViews`, would have broken that feature for every non-owner viewer — so this was
  **not** the same bug as `getViews`, just superficially similar. Fixed with data minimization only,
  no auth-guard change: `getReactions` now selects the same public-safe Profile fields `getViews`
  uses (`storyViewerSelect`/`SafeStoryReaction` in `stories.service.ts`), never the raw `User`.
- **Impact:** none remaining — password hash and other secrets are no longer selectable through this
  endpoint; the endpoint's accessibility (unauthenticated, any viewer) is unchanged by design.
- **Authority / Resolution Path:** data-minimization-only fix, no auth/permission change — did not
  require the `MUST CONFIRM` gate in `AGENTS.md`'s change policy.
- **Owner:** n/a.
- **Last Verified:** 2026-09-25.

## Frontend

*(No open known gaps — F1 nav height drift and F2 avatar `lg` drift closed in Wave 1 UI foundation,
August 2026. F6 list virtualization closed: `@tanstack/react-virtual` is used on Home, Explore, and
chat list surfaces. See `14-uiux-improvement-roadmap.md`.)*

## Tooling and CI

*(No open known gaps — PR/deploy quality gates unified via `.github/workflows/ci-quality.yml`
(includes root `npx biome ci .` and backend `npm run build`), Playwright nightly boots
Postgres/Redis/backend and runs chromium Playwright journeys (each spec creates its own user), Dependabot covers shared/Actions/Docker,
and `security.yml` runs CodeQL + informative npm audit as of August 2026. Former T1 / B2 closed:
platform fee lives in `src/common/constants/monetization.constants.ts`.)*

## Documentation

### D3 — Bottom-nav / design-token soft gaps

- **Status:** RESOLVED
- **Category:** Documentation Drift
- **Evidence:** Token audit 2026-09-05; `09` section 9.4 patch.
- **Expected State:** design tokens in product docs match `index.css`.
- **Observed State (historical):** brand hexes absent from `09` section 5.2; surface levels 4–5
  conceptual only; `UserAvatar` `xl` (80px) outside section 9.5. Closed: `--nav-bottom-height` 48px
  now matches `09` section 9.4, with agent/cursor citations and CSS fallbacks.
- **Impact:** none remaining.
- **Authority / Resolution Path:** prefer `index.css` as the implementation source; do not rewrite
  `09`/`13` wholesale for future drift of this kind.
- **Owner:** n/a.
- **Last Verified:** 2026-09-05.

### D4 — Residual creator-VIP mentions

- **Status:** IN PROGRESS
- **Category:** Documentation Drift
- **Evidence:** `rg CreatorSubscription schema.prisma` → none.
- **Expected State:** no product-doc references to a `CreatorSubscription`-shaped model that doesn't
  exist in the schema.
- **Observed State:** partially corrected September 2026 (glossary, payments agent, `00-status`,
  `10-roadmap`, `03`); residual mentions may still lag elsewhere.
- **Impact:** low — could mislead an agent into inventing the model.
- **Authority / Resolution Path:** prefer schema + `03` catalog; do not invent the model.
- **Owner:** unassigned.
- **Last Verified:** 2026-09-05.

## Maintenance

Add an entry when you find drift you are not fixing, with evidence and the full field set above —
an entry with no evidence path is not an entry. Update status as remediation progresses; move to
`RESOLVED` (with the fix's evidence) or `WONT FIX` (with the reviewed rationale) rather than deleting
outright, unless the entry was `INVALID` from the start. Periodic re-verification should identify
recurring categories of drift and address their systemic cause rather than repeatedly correcting the
same symptom.
