# Checklist — UI

Run with [`accessibility.md`](./accessibility.md) whenever visible UI changes.

## Design system

- [ ] Colours come from tokens in `src/index.css` (`--brand-*`, `--surface-*`, glass variables). No raw
      hex, no stock Tailwind palette colour.
- [ ] Dark theme only; no light-mode assumption, no theme toggle introduced.
- [ ] Existing primitives from `src/components/ui/` reused rather than forked.
- [ ] Icons from `lucide-react`; no second icon set.
- [ ] Inter for chrome; display fonts only where they are already used for content styling.
- [ ] Spacing, radius and elevation consistent with neighbouring elements; no parallel scale invented.
- [ ] Surfaces use the existing glass language (`.glass-panel`, `.glass-panel-post`, `.modal-glass`)
      rather than a new material.
- [ ] No competitor's layout, iconography, colour, typography or component replicated.

## States

- [ ] Loading state, using existing `LoadingStates` / skeletons.
- [ ] Empty state, using `EmptyState`, with a useful next action.
- [ ] Error state, using `ErrorState`, with a way to retry.
- [ ] Offline / failed-request behaviour is not a blank screen.
- [ ] Optimistic updates roll back visibly on failure.
- [ ] Hover, focus, active and disabled defined for every interactive element.

## Responsive

- [ ] Verified at mobile, tablet, laptop and desktop widths.
- [ ] Mobile shell respected: `BottomNav`, safe-area utilities (`.pb-safe`, `.pt-safe`).
- [ ] Degrades correctly below 768px where `backdrop-filter` is disabled.
- [ ] No horizontal overflow; long text, long usernames and long captions handled.
- [ ] Touch targets at least 44×44 CSS pixels.

## Motion

- [ ] Animations come from the registered set in `@theme` where possible.
- [ ] Everything animated is neutralised under `prefers-reduced-motion: reduce`.
- [ ] Interaction feedback stays fast (roughly under 300ms); nothing blocks the user waiting for an
      animation.
- [ ] No mandatory auto-playing motion without a pause affordance.

## Content

- [ ] Every user-facing string goes through i18n, with keys added to **both** `en.json` and `es.json`.
- [ ] Copy is clear and explains consequences for destructive actions.
- [ ] Media uses `ProgressiveImage` and the right variant (`thumbnailUrl` / `standardUrl`).
- [ ] Locked premium content is redacted visually and the server actually enforces it.
- [ ] Moderated content is labelled explicitly rather than silently hidden.

## Code

- [ ] Component decomposed if it passed ~300 lines.
- [ ] Data fetching through TanStack Query with the domain's existing key shape; affected keys
      invalidated.
- [ ] API calls go through a `src/services/*.service.ts` wrapper, never direct `axios`/`fetch`.
- [ ] No business rule implemented only on the client.
- [ ] `npm run lint`, `npm test` and `npm run build` pass in `circlesfera-frontend`.

## Documentation

- [ ] `09-design-system.md` updated if a token or shared primitive changed.
- [ ] Any design-system drift found but not fixed logged in `.ai/core/known-gaps.md`.
