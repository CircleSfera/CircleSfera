# Checklist — Accessibility

Target: WCAG 2.2 AA. Run with [`ui.md`](./ui.md) whenever visible UI changes.

## Keyboard

- [ ] Every interactive element is reachable by Tab in a logical order.
- [ ] Every interactive element is operable with Enter and, for buttons, Space.
- [ ] No `div` or `span` with `onClick` and no role, tab index and key handler.
- [ ] No keyboard trap other than an intentional modal trap, which is escapable with Escape.
- [ ] Custom shortcuts do not collide with browser or assistive-technology shortcuts
      (`GlobalKeyboardShortcuts.tsx`).

## Focus

- [ ] Focus indicator visible on every focusable element and never removed.
- [ ] Indicator has sufficient contrast against the dark surfaces it appears on.
- [ ] Opening a dialog moves focus into it and traps it, reusing `src/hooks/useFocusTrap.ts`.
- [ ] Closing a dialog returns focus to the element that opened it.
- [ ] Route change moves focus to the main region rather than leaving it on a stale element.

## Semantics

- [ ] Native elements used first: `button`, `a`, `nav`, `main`, `ul`/`li`, `label`, `form`.
- [ ] ARIA only where a native element cannot express it — not as a patch over the wrong element.
- [ ] Heading order is meaningful and not chosen for visual size.
- [ ] Landmarks present; the skip link to `#main-content` still works.

## Names and state

- [ ] Icon-only controls have an `aria-label`.
- [ ] Images have meaningful `alt`, or `alt=""` when purely decorative; author-provided alt text from
      the create-post accessibility screen is used where available.
- [ ] Toggles expose `aria-pressed` or `aria-checked`; expandable controls expose `aria-expanded`.
- [ ] Loading regions expose `aria-busy` or announce through the existing `aria-live="polite"` region
      in `LayoutWrapper`.
- [ ] Form errors are linked with `aria-describedby` and marked with `aria-invalid`.
- [ ] Dialogs have `role="dialog"`, `aria-modal="true"` and an accessible name — follow `Dialog.tsx`.

## Perception

- [ ] Text contrast at least 4.5:1; large text and UI boundaries at least 3:1.
- [ ] Contrast checked against the **worst-case** background, especially glass surfaces over
      photography.
- [ ] Meaning is never conveyed by colour alone.
- [ ] Text remains readable and layout intact at 200% zoom.
- [ ] `lang` is correct for the active locale.

## Motion

- [ ] Everything animated is neutralised under `prefers-reduced-motion: reduce`.
- [ ] Auto-advancing content (stories, frames) can be paused.
- [ ] No content flashes more than three times per second.

## Targets

- [ ] Touch targets at least 44×44 CSS pixels, especially in `BottomNav` and post actions.
- [ ] Adjacent targets have enough spacing to avoid mis-taps.

## Verification

- [ ] A keyboard-only walkthrough of the changed flow was actually performed, and the steps are
      reported.
- [ ] What a screen reader should announce at each step is described.
- [ ] No third focus-trap implementation was introduced (`.ai/core/known-gaps.md` F5).
- [ ] Findings recorded with file, element, WCAG criterion and severity.
