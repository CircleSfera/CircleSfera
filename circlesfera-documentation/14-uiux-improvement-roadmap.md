# CircleSfera UI/UX Improvement Roadmap

> **Status**: Waves 0–4 **shipped** (August 2026) — roadmap complete for Phase 1 UI/UX consolidation  
> **Created**: August 2026  
> **Horizon**: Phase 1 / NOW — consolidación de identidad visual y UX  
> **Related**: [09-design-system.md](./09-design-system.md), [13-layout-guidelines.md](./13-layout-guidelines.md), [12-global-roadmap.md](./12-global-roadmap.md), [00-status.md](./00-status.md)

---

## 1. Purpose

This document is the prioritized plan to recover **visual and UX consistency** across the CircleSfera web SPA without changing the product’s visual identity.

CircleSfera already has:

- An official Design System ([09](./09-design-system.md)) and Layout Guidelines ([13](./13-layout-guidelines.md))
- Shipped dark-only theme, glass surfaces, and CSS tokens in `circlesfera-frontend/src/index.css`
- Shared primitives under `circlesfera-frontend/src/components/ui/`

The problem is **implementation drift**: tokens ignored, primitives under-adopted, modal sprawl, uneven density, and incomplete loading/empty/error states across consumer, creator, and admin surfaces.

This roadmap is **planned work**. Present tense elsewhere in the docs means shipped; wave items below are not shipped until their implementation PRs land.

---

## 2. Verdict and principles

| Do | Do not |
| --- | --- |
| Close token / primitive / density drift | Redesign brand identity |
| Mobile-first at **390×844**; desktop adapts layout | Enlarge UI on large screens |
| Dark theme only; glass language as today | Light theme or theme toggle |
| Reuse / extend `components/ui/` | Add a UI kit, CSS-in-JS, or second icon set |
| Extract UX *principles* from Instagram / Threads / X / TikTok | Copy competitor layout, colour, type, or components |
| Keep admin tab IA (`adminNav.ts`) | Rebuild admin as a new product |

**Canonical tokens for implementation:** `circlesfera-frontend/src/index.css` (`:root` + Tailwind v4 `@theme`).  
**Canonical narrative rules:** docs 09 and 13.  
**When tokens and 09/13 disagree on sizes:** tokens ship; update 09/13 in the same implementation wave (see §4 and [known-gaps](../.ai/core/known-gaps.md) F1–F2).

**Implementation playbook when coding starts:** [`.ai/playbooks/ui-redesign.md`](../.ai/playbooks/ui-redesign.md)  
**Specialists:** ux-researcher → product → design-system → frontend → accessibility.

---

## 3. Problem diagnosis (verified)

Findings from frontend inspection (August 2026). Evidence paths are under `circlesfera-frontend/` unless noted.

| Problem | Evidence |
| --- | --- |
| Brand colour split | `--brand-primary: #8c52ff` in `src/index.css` vs legacy `#833ab4` / `rgba(131,58,180,…)` in Input focus, empty/error CTAs, shimmer, avatar rings |
| Surface drift | Layout/body backgrounds using `#08060f` while `--surface-base` is `#030303` |
| Primitives under-adopted | `ui/Dialog` used in ~2 call sites; `ui/Avatar` unused; product uses `UserAvatar.tsx`; many local `<button>` and `fixed inset-0` overlays |
| Density irregularity | Creator/marketing empty blocks with large vertical padding; oversized modal radii; magic viewport heights in Messages instead of `--nav-*-height` |
| Incomplete states | Feed/Explore/Saved often use shared `ErrorEmptyStates`; chat and creator invent ad-hoc empties |
| Admin divergence | Separate shell + empty state; filter labels hardcoded in Spanish in several tabs |
| Nav / avatar doc↔code mismatch | Tokens: `--nav-bottom-height: 60px`, `--avatar-lg: 56px`; `UserAvatar` `lg` = 48px; docs 09 prescribe bottom nav 80–88px and L avatar 56px |

---

## 4. Decision: tokens vs guidelines (sizes)

**Decision (August 2026):** For nav heights and avatar scale, **shipped CSS tokens in `index.css` are authoritative** during implementation. Docs 09/13 must be aligned to those tokens in Wave 1 (or Product explicitly overrides tokens first).

| Dimension | Token / code today | Doc 09 / 13 | Resolution |
| --- | --- | --- | --- |
| Bottom nav height | `--nav-bottom-height: 60px` | 80–88px | Keep token; update docs in Wave 1 |
| Top nav height | `--nav-top-height: 52px` | 56–64px | Keep token; update docs in Wave 1 |
| Avatar `lg` | Token 56px; `UserAvatar` `lg` = 48px | 56px | Align `UserAvatar` to token scale (S32 / M40 / L56) in Wave 1 |
| Brand primary | `#8c52ff` | Some agent rules still cite `#833ab4` | Freeze on `#8c52ff`; purge legacy hex |

Drift tracked until Wave 1 closes it: `.ai/core/known-gaps.md` **F1**, **F2** — **closed August 2026** (tokens + docs + `UserAvatar` `lg` = 56px).

---

## 5. Goals and non-goals

### Goals

1. One visual truth: brand, surfaces, nav, avatars.
2. Consistent use of shared primitives (Button, Input, Dialog, state kit).
3. High information density comparable to Instagram / Threads / X (content > chrome).
4. Every touched screen: loading, empty, error (+ offline where applicable).
5. WCAG 2.2 AA baseline (focus, contrast, touch ≥ 44×44, reduced motion).
6. All UI strings via i18n (`en.json` + `es.json`).

### Non-goals (explicit)

From [00-status.md](./00-status.md) OUT OF SCOPE — do not use this roadmap to open them:

- Native mobile apps
- Communities / forums
- B2B Business Manager
- Public OAuth / developer portal UI
- SSR indexable profiles
- Subscriber badges as a first-class product surface
- Data warehouse / executive BI dashboards
- In-app creator payout initiation (Stripe Express only; read-only balance UI stays)

Also rejected under this roadmap:

- Light theme
- New UI kit or parallel design language
- Merging Admin and Consumer into a single shell (share tokens; keep separate shells)
- Landing marketing overhaul as part of Waves 1–2 (reopened Aug 2026 as guest-surface redesign — product windows + glass cards on `/` and shared Guest chrome for Features/Explore/Pricing/Support/Legal; see CHANGELOG Unreleased)

---

## 6. Cross-cutting acceptance criteria (DoD for any wave)

A wave item is done only when all of the following hold for the files it touches:

1. **Tokens only** — colours from `bg-brand-*`, `bg-surface-*`, glass utilities; no stock Tailwind palette (`zinc`, `gray`, `purple`, `blue-600`) in chrome unless justified and documented.
2. **Primitives** — interactive chrome uses or extends `src/components/ui/`; no one-off forks of Button/Input/Dialog.
3. **Four states** — loading / empty / error (+ offline where relevant) via `LoadingStates`, `EmptyState`, `ErrorState` (or a thin domain wrapper over them).
4. **i18n** — no hardcoded Spanish/English UI labels; keys in both locale files.
5. **a11y** — touch targets ≥ 44×44 CSS px; visible focus; animations respect `prefers-reduced-motion`.
6. **Mobile gate** — validated at **390×844** before desktop adaptation.
7. **No new UI dependencies** — no component library, CSS-in-JS layer, or second icon set (`lucide-react` only).
8. **Viewport density** — useful content targets ~80–90% of the mobile viewport (per Layout Guidelines).

---

## 7. Wave map

```text
Ola 0 Audit  →  Ola 1 Fundación  →  Ola 2 Consumer  →  Ola 3 Herramientas  →  Ola 4 Admin
```

**Rule:** complete Wave 1 before visual polish of individual consumer screens. Foundation first prevents rework.

---

## 8. Wave 0 — Audited inventory (pre-code, 1–2 days)

**Status:** Done (August 2026) — see Appendix A  
**Output:** checklist in Appendix A; Wave 1 executed from this inventory.

| Check | Method |
| --- | --- |
| Raw hex / stock palette vs tokens | `rg` over `circlesfera-frontend/src` for `#833ab4`, `bg-zinc-`, `text-gray-`, `bg-purple-`, etc. |
| Overlays not using `Dialog` | Inventory `fixed inset-0` / custom modal patterns vs `ui/Dialog` callers |
| Screens missing Empty/Error | Route map from `App.tsx` vs `ErrorEmptyStates` / ad-hoc empties |
| Size mismatches | Nav tokens, `UserAvatar` sizes, doc 09 §9 |

**Exit criteria:** inventory attached to the first Wave 1 PR; known-gaps F1/F2 still accurate or updated.

---

## 9. Wave 1 — Foundation (high impact / low product risk)

**Status:** Shipped (foundation) — August 2026  
**Goal:** one visual truth; minimum viable primitive adoption policy.

| ID | Item | Change | Anchor files |
| --- | --- | --- | --- |
| 1.1 | Token freeze | Single `--brand-primary` (`#8c52ff`); remove legacy `#833ab4` / `rgba(131,58,180)`; unify app background to `--surface-base`; sync agent/cursor token citations | `src/index.css`, `ui/Input.tsx`, `ErrorEmptyStates.tsx`, `UserAvatar.tsx`, `.cursor/rules/50-uiux.mdc`, `.ai/agents/design-system.md` |
| 1.2 | Nav tokens | One source for top/bottom heights; layouts and Messages use `var(--nav-*-height)` | `index.css`, `BottomNav.tsx`, `Messages.tsx`, `LayoutWrapper.tsx` |
| 1.3 | Single avatar API | Retire or thin-wrap `ui/Avatar` behind `UserAvatar`; sizes S32 / M40 / L56 matching tokens | `UserAvatar.tsx`, `ui/Avatar.tsx`, `ui/index.ts` |
| 1.4 | Dialog adoption path | Policy: new modals = `Dialog`; migrate top-N critical overlays (confirm, report, followers) | `ui/Dialog.tsx`, `components/modals/*`, `FollowersModal.tsx`, report/confirm modals |
| 1.5 | Button / Input policy | Chrome CTAs and forms use `ui/Button` / `ui/Input`; ban stock palette on those primitives | `ui/Button.tsx`, hot callers |
| 1.6 | State kit contract | Document and enforce Empty/Error/Loading usage; Admin empty as thin wrapper or merge | `ErrorEmptyStates.tsx`, `LoadingStates.tsx`, admin empty component |
| 1.7 | Doc alignment | Update 09/13 nav/avatar numbers to match tokens (per §4) | `09-design-system.md`, `13-layout-guidelines.md` |

**Wave 1 DoD:** criteria in §6 + zero remaining `#833ab4` in frontend chrome + F1/F2 removable from known-gaps.

**Out of Wave 1:** Feed/Chat layout redesigns; Admin tab content; product copy changes; new animations.

---

## 10. Wave 2 — Consumer core (highest perceived impact)

**Status:** Shipped (August 2026)  
**Prerequisite:** Wave 1 complete.

Implement in this order (traffic / perception):

### 2.1 Feed + PostCard

| | |
| --- | --- |
| **Problem** | Chrome vs content balance; gap/density drift; list states uneven |
| **Change** | Post gaps 12–16px; minimize chrome; shared list loading/empty/error |
| **Complexity** | Medium |
| **Risk** | Low relearning if interaction model unchanged |
| **Anchors** | `pages/Home.tsx`, `PostCard.tsx`, `components/post/*` |

### 2.2 Profile

| | |
| --- | --- |
| **Problem** | Header weight; grid density; highlights query without UI |
| **Change** | Compact header; grid gap ~4px; resolve highlights UI gap or remove dead query |
| **Complexity** | Medium |
| **Risk** | Medium if header hierarchy changes abruptly |
| **Anchors** | `pages/Profile.tsx`, `components/profile/*` |

### 2.3 Chat

| | |
| --- | --- |
| **Problem** | Ad-hoc empty UI; magic viewport heights; row density |
| **Change** | Shared Empty/Error; row height ~68–76px; viewport uses nav tokens |
| **Complexity** | Medium |
| **Risk** | Low if conversation IA stays |
| **Anchors** | `pages/Messages.tsx`, `components/chat/*` |

### 2.4 Stories / Frames

| | |
| --- | --- |
| **Problem** | Control reach (thumb zone); media density vs chrome |
| **Change** | Full-bleed viewers; primary controls in thumb zone; density per §13 Stories/Frames |
| **Complexity** | Medium–High |
| **Risk** | Medium (gesture/viewer habits) |
| **Anchors** | `StoryViewer.tsx`, `pages/Frames.tsx`, `FrameItem.tsx` |

### 2.5 Explore / Notifications / Saved

| | |
| --- | --- |
| **Problem** | Grid/list density and state consistency vs Feed |
| **Change** | Dense grids (Explore ~2–4px gaps); unified state kit |
| **Complexity** | Low–Medium |
| **Risk** | Low |
| **Anchors** | `Explore.tsx`, `Notifications.tsx`, `Saved.tsx` |

Benchmarking allowed only as **principles** (content-first, predictable structure, progressive disclosure) — never visual cloning.

---

## 11. Wave 3 — Tools (Creator Studio + Settings)

**Status:** Shipped (August 2026)  
**Prerequisite:** Wave 2 substantially complete for shared patterns.

| ID | Surface | Problem | Change | Anchors |
| --- | --- | --- | --- | --- |
| 3.1 | Settings | Monolithic page (~1.6k lines); high cognitive load | Progressive disclosure; section density; plan component split in implementation | `pages/Settings.tsx`, `components/settings/*` |
| 3.2 | Creator Studio | Oversized empty states; KPI chrome weight | Dense empties; compact KPIs; token-aligned shell | `Creator.tsx`, `creator/*`, `CreatorShell.tsx` |
| 3.3 | Monetization / Pricing | CTA hierarchy noise | Clear primary CTA; no in-app payout initiation | `payments/Pricing.tsx`, `monetization/*` |
| 3.4 | Create Post / Edits | Overlay and control density | Dialog where overlays exist; denser control chrome | `CreatePostModal.tsx`, `create-post/*`, `EditsStudio.tsx`, `studio/*` |

---

## 12. Wave 4 — Admin

**Status:** Shipped (August 2026)  
**Prerequisite:** Wave 1 state kit + tokens.

| Item | Change |
| --- | --- |
| Keep IA | Preserve `adminNav.ts` tabs; do not reinvent the panel |
| Tokens | Typography, spacing, surfaces from the same token set |
| i18n | Replace hardcoded Spanish UI strings with locale keys |
| States | Use Wave 1 Empty/Loading kit (no parallel one-offs) |
| Density | Back-office dense tables; no marketing chrome |

**Anchors:** `pages/Admin.tsx`, `components/admin/AdminShell.tsx`, `adminNav.ts`, tab components under `components/admin/`.

**Defer:** merging AdminShell with consumer LayoutWrapper. Residual stock-palette (`text-gray-*` / `zinc-*`) in deep tab detail chrome is follow-up polish, not a Wave 4 blocker.

---

## 13. Surface → wave map

| Surface | Routes (representative) | Wave |
| --- | --- | --- |
| Tokens / ui primitives / nav / avatar / Dialog policy | — | 1 |
| Feed, posts | `/`, `/p/:id` | 2 |
| Profile | `/:username` | 2 |
| Chat | `/direct/inbox` | 2 |
| Stories / Frames | viewer, `/frames` | 2 |
| Explore / Activity / Saved | `/explore`, `/activity`, `/saved` | 2 |
| Settings | `/accounts/edit` | 3 |
| Creator Studio | `/creator/:tab` | 3 |
| Pricing / monetization UI | `/pricing`, settings/creator tabs | 3 |
| Create / Edits | `/create`, `/edits` | 3 |
| Admin Panel host | `/:tab` (home `/trust`) | 4 |
| Auth / legal / support | `/accounts/*`, `/terms`, … | Opportunistic with Wave 1 tokens; full polish only if blocking |

---

## 14. Prioritization summary

| Priority | Action |
| --- | --- |
| First | Wave 0 inventory → Wave 1 foundation complete |
| Next | Wave 2 in listed order (Feed → Profile → Chat → Stories/Frames → Explore/Activity/Saved) |
| Later | — (Admin stock-palette follow-up closed) |
| Defer | New micro-animations; single Admin+Consumer shell |
| Done (Aug 2026) | Guest landing / marketing overhaul (product-led `/` + GuestSurfaceMedia, Features/Explore/Pricing chrome) |
| Reject | Light theme; new UI kit; communities UI; B2B manager; badge-centric product; in-app payout start |

---

## 15. Success metrics (checkable)

| Metric | Target |
| --- | --- |
| Legacy brand hex `#833ab4` in frontend chrome | 0 after Wave 1 |
| Stock palette classes in Wave-touched chrome | 0 (or documented exception) |
| New modals using `ui/Dialog` | 100% |
| Top-N critical modals migrated | Per Wave 1.4 checklist |
| Consumer core routes | Pass Layout Guidelines validation (mobile 390, density, four states) |
| Admin tabs migrated in Wave 4 | 0 hardcoded Spanish UI labels |

Qualitative: users should never feel they left CircleSfera when moving between Feed, Chat, Creator, and Admin chrome.

---

## 16. Execution notes

- **This document tracks planned waves.** Wave 1 foundation code landed under this roadmap (token freeze, nav/avatar alignment, Dialog for Confirm/Report/Followers, state-kit alignment). Further waves use [`.ai/playbooks/ui-redesign.md`](../.ai/playbooks/ui-redesign.md).
- Schema, auth, monetization rules, and public API contracts are out of scope unless a UI wave explicitly requires a confirmed AGENTS.md change.
- If Product later chooses doc sizes (e.g. taller bottom nav) over tokens, update `index.css` first, then UI — do not leave a third parallel value in components.

---

## 17. Document maintenance

| Event | Action |
| --- | --- |
| Wave starts | Mark wave **In progress** in this file |
| Wave ships | Mark **Shipped** with date; remove related known-gaps entries in the same PR |
| Scope change | Amend this file; do not silently expand into 00-status OUT OF SCOPE |

**Owner:** Product + Frontend.  
**Last updated:** August 2026.

---

## Appendix A — Wave 0 inventory (August 2026)

| Check | Result |
| --- | --- |
| Legacy `#833ab4` / `rgba(131,58,180)` | Present across `index.css`, Input, EmptyStates, LoadingStates, chat, studio, legal pages — **purged in Wave 1** to `#8c52ff` / `--brand-primary-rgb` |
| `#08060f` surface drift | `body` + LayoutWrapper — **aligned to `--surface-base`** |
| Overlays without Dialog | ~35 `fixed inset-0` files; Dialog callers were Confirm + PromoteUser only. Wave 1 migrates **Followers** + **Report** (+ Confirm already) |
| Stock palette (`bg-zinc` / `text-gray` / etc.) | Widespread — full purge deferred to Waves 2–4 per surface; Wave 1 hardened **Button/Input/Dialog/AdminEmptyState** |
| Avatar | `ui/Avatar` orphan; `UserAvatar` `lg`=48 vs token 56 — **fixed**; `ui/Avatar` re-exports `UserAvatar` |
| Nav | `--nav-bottom-height: 60px`; Messages used `100vh-80px` — **tokenized** |

---

## Appendix B — Wave 2 shipped checklist (August 2026)

| Surface | Changes |
| --- | --- |
| Feed | Empty/login → shared `EmptyState`; keep `ErrorState` + skeletons; gaps already 12px |
| Profile | Compact header; private + grid empties → `EmptyState`; collections `gap-1`; stale highlights comment removed |
| Chat | List/thread/SelectChat → `EmptyState`/`LoadingSpinner`; rows `min-h-[72px]`; Messages `100dvh` + nav token |
| Stories/Frames | Thinner StoryViewer gradients; denser Frame action rail; Frames height fallback 60px |
| Explore | Masonry/search grids → `gap-1` |
| Notifications | `ErrorState` + denser rows |
| Saved | `LoadingSpinner` |

---

## Appendix C — Wave 3 shipped checklist (August 2026)

| Surface | Changes |
| --- | --- |
| Creator empties | Stories/Posts/Promotions → `EmptyState` |
| Settings | Requests empty + Appeals kit; shell/billing brand tokens; notification toggles → brand |
| Tip / Promote / NewPromo | Migrated to `ui/Dialog`; denser promo chrome |
| Pricing | Dense cards + `LoadingSpinner` |
| Analytics KPIs | Brand token gradients |
| Create-post subscreens | `bg-surface-elevated`, tighter radius (Dialog fullscreen editors deferred) |

---

## Appendix D — Wave 4 shipped checklist (August 2026)

| Surface | Changes |
| --- | --- |
| Locales | Expanded `admin.*` keys (shared, users/posts/comments KPIs, lives, settings, firewall, verification, payouts, roles, split) in `en.json` / `es.json` |
| Tabs i18n | Users, Posts, Comments, LiveStreams, Settings, Firewall shell/rules, UserVerification, Payouts, Roles |
| Shell / list chrome | AdminShell, AdminSplitView, AdminList → `text-white/…`; split empty → `AdminEmptyState` |
| Tables / KPIs | AdminTable empty → compact `AdminEmptyState`; StatusBadge + StatCard brand tokens |
| Live detail | `admin.lives.no_video_source`; muted chrome → white/opacity |
| Follow-up polish | Stock `text-gray-*` / `zinc-*` purged across deep admin tabs (≈250 class replacements → `text-white/…`); chart hex → brand `#8c52ff` / `#5271ff`; CommandPalette + AdminShell search keys without Spanish fallbacks |
| Mobile density (Aug 2026) | 2-col KPI grids from base width; denser StatCard/detail panes; responsive analytics chart height; dead `xs:` → `sm:`; ≥44px touch on segmented control, user-filter clear, firewall sub-tabs |
| Trust as T&S entry (Aug 2026) | Post-login / index home → `/trust` (permission-aware); Trust first under Dashboard; attention summary + KPI links + clickable queue rows |
