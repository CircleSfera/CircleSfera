# Playbook — UI / UX redesign

Restructuring a screen, its information architecture, or its interaction flow — **without changing
CircleSfera's visual identity**.

Specialists: `ux-researcher` → `product` → `design-system` → `frontend` → `accessibility`.

## 1 — Document the current state first

You may not propose a redesign before you have described what exists. For each screen in scope:

- The route and file (`src/App.tsx` → the page component).
- The component tree and which components are shared with other screens.
- The current flow: entry point, steps, decisions, dead ends, number of taps to complete the primary
  task.
- Which states are handled: loading, empty, error, offline.
- Behaviour at each breakpoint, including the mobile shell (`BottomNav`, safe areas).
- Which data it fetches and how much of it is used.

## 2 — Benchmark with discipline

Studying Instagram, TikTok, X, Threads, YouTube and Apple is encouraged. The output is a **principle**,
never a copy instruction.

For each pattern you cite:

- What the pattern is.
- **Why** it works — the underlying UX reason, not "because Instagram does it".
- Whether CircleSfera's principles allow it. Anything that hides visibility levers, obscures ranking,
  or removes user control is rejected regardless of how well it performs elsewhere.

Never replicate layout, iconography, colour, typography, animation, copy or components.

## 3 — Diagnose

For every screen, be concrete:

- What works and must be preserved.
- What is broken, tied to a named UX principle (Hick, Fitts, Jakob, Gestalt, progressive disclosure,
  cognitive load, visual hierarchy).
- What is noise and can be removed.
- What is hidden and should be visible, or visible and should be secondary.
- Which steps or decisions can be eliminated outright — the strongest improvement is usually removal,
  not rearrangement.

## 4 — Propose

Each proposal states:

- **Problem** it solves.
- **Change:** what moves, what is removed, what is grouped, what becomes progressive disclosure.
- **Implementation:** which existing components and tokens. If it needs a new shared primitive, say so
  and justify it.
- **Expected impact:** which step disappears, which decision gets easier, what gets faster to
  perceive.
- **Complexity:** low / medium / high, with the files affected.
- **Risk:** what regresses, what users have to relearn.

Order by impact-to-effort and say which proposals you would **not** do.

## 5 — Respect the design system

Non-negotiable ([`../agents/design-system.md`](../agents/design-system.md)):

- Tokens from `src/index.css`: `--brand-*`, `--surface-*`, the glass variables. No raw hex, no stock
  Tailwind palette colours.
- Dark theme only. No light theme, no toggle.
- Existing primitives in `src/components/ui/`, `lucide-react` icons, Inter for chrome.
- Glass utilities (`.glass-panel`, `.modal-glass`) for surfaces; no new material.
- Animations from the registered set, all neutralised under `prefers-reduced-motion`.

## 6 — Implement

- Route changes in `src/App.tsx`, preserving legacy redirects.
- Reuse `LoadingStates`, `EmptyState`, `ErrorState` for the four states.
- Keep data fetching in TanStack Query with the domain's existing key shape, and invalidate correctly.
- Every string through i18n, keys added to **both** `en.json` and `es.json`.
- Decompose components past ~300 lines.
- Keyboard, focus and ARIA as you go, not afterwards
  ([`../agents/accessibility.md`](../agents/accessibility.md)).

## 7 — Verify

```bash
cd circlesfera-frontend && npm run lint && npm test && npm run build
npx biome check --write --files-ignore-unknown=true --no-errors-on-unmatched \
  $(git diff --name-only HEAD)   # scoped on purpose; see ../core/quality.md
```

Then manually: keyboard-only walkthrough, mobile viewport, empty and error states, reduced-motion
enabled, and the primary task timed against the old flow.

## 8 — Close

Run [`../checklists/ui.md`](../checklists/ui.md) and
[`../checklists/accessibility.md`](../checklists/accessibility.md).

Update `09-design-system.md` if a token or shared primitive changed. Report what improved, what you
deliberately left alone, and what users will have to relearn.
