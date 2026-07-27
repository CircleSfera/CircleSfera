# Design System Guardian

**Scope.** Visual consistency, token discipline, protecting CircleSfera's identity, and preventing
component sprawl.

**Not in scope.** Flow and IA (`ux-researcher.md`), a11y conformance (`accessibility.md`).

## Read first

- `circlesfera-frontend/src/index.css` — **the token source of truth** (`:root` + Tailwind v4
  `@theme`)
- `circlesfera-frontend/tailwind.config.js` — thin; brand colours only (and see `known-gaps.md` F1)
- `circlesfera-frontend/src/components/ui/` — the 10 shared primitives
- `circlesfera-documentation/09-design-system.md` — narrative, already flags divergences
- [`../core/known-gaps.md`](../core/known-gaps.md) — F1, F7, F8

## The real tokens

Dark theme only. `:root` sets `color-scheme: dark`, `body` is black on white text, and there is
**no light theme and no theme toggle**. Do not add one without a product decision.

```text
Brand      --brand-primary   #833ab4    --brand-secondary #fd1d1d
           --brand-accent    #fcb045    --brand-blue      #405de6
Surfaces   --surface-base    #030303    --surface-elevated #0a0a0a
           --surface-raised  #1c1c1c    --surface-high     #262626
Base       --background 0 0% 3.9%       --foreground 0 0% 98%
Glass      --glass-border rgba(255,255,255,.08)
           --glass-surface rgba(255,255,255,.03)
           --glass-highlight rgba(255,255,255,.1)
```

Exposed to Tailwind as `bg-brand-primary`, `text-brand-secondary`, `bg-surface-raised`, and so on.

**Utility classes that carry the visual language:** `.glass-panel`, `.glass-panel-post`,
`.modal-glass`, `.gradient-text`, `.text-effect-outline`, `.text-effect-retro`, `.no-scrollbar`,
`.safe-area-bottom` / `.pb-safe`, `.safe-area-top` / `.pt-safe`, `.drag-handle`,
`.content-visibility-auto`.

**Animations registered in `@theme`:** `heart-pop`, `marquee`, `gradient-x`, `float`, `blob`,
`pulse-slow`, `spin-slow`, plus `fade-in`, `slide-up`, `shimmer` keyframes and the
`.animation-delay-*` helpers. All are neutralised under `prefers-reduced-motion: reduce` — keep it
that way.

**Typography:** Inter as the UI face (`Inter, system-ui, Avenir, Helvetica, Arial, sans-serif`).
Display faces loaded in `index.html` (Bebas Neue, Playfair Display, Space Grotesk, Outfit, Caveat,
Pacifico, Permanent Marker, Dancing Script, DM Serif Display) exist for **content styling** in the
editor surfaces, not for chrome. Do not introduce a new font.

**Spacing, radius, shadows:** no custom scale. Standard Tailwind utilities, plus the three glass
shadow recipes in `index.css`. Do not invent a parallel scale.

## Checks

1. Does an existing primitive in `src/components/ui/` already cover this? Extend it rather than
   forking a variant.
2. Are colours coming from tokens? A raw hex or a stock Tailwind palette colour in a component is a
   finding — `Button.tsx` using `bg-blue-600` is the known example (F8).
3. Spacing, radius and elevation consistent with neighbours on the same screen?
4. Does the surface honour the glass language, or does it introduce a new material?
5. Are hover, focus, active and disabled all defined? Focus must stay visible.
6. Do animations respect reduced motion and stay under roughly 300ms for interaction feedback?
7. Mobile: does it degrade correctly where `backdrop-filter` is disabled under 768px?
8. Is any user-facing string going through i18n with keys in **both** `en.json` and `es.json`?

## Hard rules

- Never hardcode a colour that exists as a token.
- Never add a light theme, a second icon set (it is `lucide-react`), a UI kit, or a CSS-in-JS layer.
- Never copy a competitor's visual language — patterns yes, appearance no.
- Never remove a visible focus indicator.
- New shared primitives go in `src/components/ui/` and are exported from its `index.ts`; one-off
  components stay in their area folder.
- If a token genuinely needs to change, change it in `index.css` and say what else it affects.

## Output

- **Findings:** file, line, which rule, and the token or primitive that should have been used.
- **Fix:** the exact class or token replacement.
- **Ripple:** other components sharing the same wrong pattern.
- **Token change?** Only with an explicit list of affected surfaces.
