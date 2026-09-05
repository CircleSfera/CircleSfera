# ADR-0018: Content Composer IA (dual-path + Mobile First)

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** CircleSfera engineering
- **Scope:** frontend | product | content create UX

## Context

ADR-0017 fixed **which chrome** surrounds create (`create` shell: no Top/Bottom nav). It did not define **how** Post, Story, and Frame compose inside that shell.

As-built pain (pre-decomposition):

- Upload / edit / caption use a stepped card; Story opens a separate `fixed inset-0` editor — two visual regimes.
- StoryComposer packed header tools, canvas, and panels into competing chrome; poll/QnA sat at the same weight as primary tools. (Shipped: decomposed under `story/` — orchestrator &lt;300 lines per UI module.)
- Desktop-first tweaks (floating card, framed phone preview) were validated before mobile density — contradicts CircleSfera Mobile First (390×844).

Create entry already routes modes via `CreateBottomSheet` → `/create?mode=*`. That entry should own mode identity; the canvas should not re-negotiate it.

## Decision

CircleSfera Create uses a **dual-path Content Composer IA** on the existing `create` shell (ADR-0017 unchanged):

| Path | Modes | Structure |
| --- | --- | --- |
| **Immersive canvas** | STORY (incl. Círculo) | Full-bleed mobile editor; minimal header; icon-only tool rail; panels as bottom sheets; **Done** handoff to Share (music / Círculo / publish) |
| **Stepped** | POST, FRAME | Upload → Edit → Caption with shared `ComposerChrome`; PhotoEditor overlay uses the same glass circular icon language as Story chrome |

**Mobile First is a hard constraint:** design and accept each phase at **390×844** first. Desktop (`md+`) adapts (narrow floating card / optional framed 9:16 preview). Story on mobile is full-bleed — no phone bezel. Framed preview is `md+` only.

**Progressive disclosure:** primary tools = Background, Text, Stickers, Templates, Draw. Poll and Q&A live under “More” (or equivalent overflow), not on the primary rail.

**Mode at entry:** `CreateBottomSheet` / `?mode=` is the source of truth. Upload may still allow mode change, but the header does not duplicate mode labels.

Does **not** change API contracts, schema, LiveKit, monetization, or ADR-0017 shell matrix.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Single immersive canvas for Post/Frame/Story | Post needs gallery + carousel + caption subscreens; forcing one canvas increases cognitive load |
| Keep stepped Story with card chrome | Fights 9:16 density and thumb-zone create patterns; already failing Mobile First review |
| Copy Instagram create UI | Violates ui-redesign playbook (principles only) and CircleSfera identity |
| Reopen ADR-0017 for composer IA | Shell vs IA are different decisions; keep shells stable |

## Consequences

**Accepted costs.** Story users relearn Poll/Q&A under “More”. StoryComposer must be decomposed (&lt;300 lines per UI module). Export (`html-to-image`) must keep a stable canvas `containerRef` under full-bleed.

**Constraints.** No desktop-only acceptance of create UI. No new content types or API in this ADR. Tokens / dark theme / lucide / i18n en+es remain mandatory.

**What this does not decide.** Camera-first capture UX, auto-edit (“First Draft”), PhotoEditor filter set, Live/Destacadas menu items beyond existing sheet destinations.

## Implementation anchors

- `circlesfera-frontend/src/layouts/contentShell.ts` — `create` shell (ADR-0017)
- `circlesfera-frontend/src/components/ContentComposerPage.tsx` — stepped orchestrator
- `circlesfera-frontend/src/components/story/StoryComposer.tsx` (+ split modules under `story/`) — immersive path
- `circlesfera-frontend/src/components/create-post/` — Upload / Edit / Caption + shared chrome
- `circlesfera-frontend/src/components/modals/CreateBottomSheet.tsx` — mode entry
- `circlesfera-documentation/13-layout-guidelines.md` — create section + Mobile First

## Revisiting

Supersede if product consolidates Post and Story into one canvas with measurable completion-rate gains, or if native camera capture becomes the primary create entry (would need a new ADR).
