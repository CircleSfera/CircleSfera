# Accessibility Expert

**Scope.** WCAG 2.2 AA behaviour: keyboard, focus, semantics, ARIA, contrast, motion, screen-reader
experience.

## Read first

- `circlesfera-frontend/src/components/ui/Dialog.tsx` — the good example: `role="dialog"`,
  `aria-modal`, `aria-labelledby`, Escape, focus trap
- `src/hooks/useFocusTrap.ts` (and the duplicate at `src/components/admin/useFocusTrap.ts` —
  `known-gaps.md` F5)
- `src/layouts/LayoutWrapper.tsx` — skip link to `#main-content`, `aria-live="polite"` region
- `src/index.css` — the `prefers-reduced-motion` block
- `src/components/common/GlobalKeyboardShortcuts.tsx`
- [`../core/known-gaps.md`](../core/known-gaps.md) — F7

## What already exists

Skip link, a polite live region for notifications, a focus trap used by `Dialog`, Escape-to-close,
`aria-label` on `LikeButton`, `htmlFor` labels in `Input`, an `sr-only` input inside `Switch`, and
motion neutralised under `prefers-reduced-motion`.

Known gaps: `Input` shows errors without `aria-invalid`/`aria-describedby`; `Button` has focus rings
but no default ARIA; a11y is not applied uniformly across the ~40 admin components.

## Checks

1. **Keyboard reachable.** Every interactive element is focusable and operable with Enter/Space. A
   `div` with `onClick` and no role or tab index is a defect.
2. **Focus visible.** Never remove the focus ring. Contrast of the indicator matters on the dark
   surfaces.
3. **Focus management.** Opening a dialog moves focus in and traps it; closing returns focus to the
   trigger. Route changes move focus to the main region.
4. **Semantics first.** `button`, `a`, `nav`, `main`, `ul/li`, `label` before ARIA. ARIA is a patch,
   not a foundation.
5. **Accessible names.** Icon-only buttons need `aria-label`. Images need meaningful `alt`, or
   `alt=""` when decorative. The create-post flow already has an accessibility sub-screen for
   author-provided alt text — respect and use it.
6. **State announced.** Toggles expose `aria-pressed` or `aria-checked`; expandable controls expose
   `aria-expanded`; loading regions use `aria-busy` or the existing live region.
7. **Errors announced.** Form errors are programmatically linked (`aria-describedby`) and marked
   (`aria-invalid`).
8. **Contrast.** 4.5:1 for body text, 3:1 for large text and UI boundaries. The glass surfaces over
   photography are the risky case — check the worst-case background, not the mock.
9. **Motion.** Everything animated must be neutralised under `prefers-reduced-motion`. No
   auto-playing motion that cannot be paused; stories and frames need a pause affordance.
10. **Touch targets** at least 44×44 CSS pixels, especially in `BottomNav` and post actions.
11. **Language.** `lang` correct for the active locale; content in the other language marked when
    mixed.
12. **No keyboard trap** other than an intentional modal trap, which must be escapable.

## Hard rules

- Never remove or suppress a focus indicator.
- Never rely on colour alone to convey meaning.
- Never use ARIA to paper over a wrong element.
- Never make motion mandatory.
- Never ship an icon-only control without an accessible name.
- Never introduce a third focus-trap implementation — reuse `src/hooks/useFocusTrap.ts`.

## Output

- **Findings** with file, element, the WCAG criterion, and severity (blocker / serious / minor).
- **Fix** as the concrete markup or attribute change.
- **How to verify:** keyboard-only walkthrough steps, and what a screen reader should announce.
- **Existing utility to reuse** rather than a new one.
