# Known gaps and drift

Contradictions and accepted debt recorded so agents do not mistake them for unintentional bugs,
and do not "helpfully" change them without an owner. Re-verified **2026-09-05**.

**How to use this file:** if your task touches an entry, mention it. If your task *is* an entry, fix
it deliberately with tests and remove the entry in the same PR. Do not batch unrelated fixes.

## Backend

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| B6 | No repository layer, no mappers, no domain event bus. | `rg Repository` in `src/` finds none | Accepted architecture. Listed so agents stop proposing layers. |

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

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| D3 | Soft gaps remain after Sep 2026 bottom-nav sync: brand hexes absent from 09 section 5.2; surface levels 4–5 conceptual only; `UserAvatar` `xl` (80px) outside section 9.5. **Closed:** `--nav-bottom-height` 48px now matches 09 section 9.4 + agent/cursor citations + CSS fallbacks. | Token audit 2026-09-05; 09 section 9.4 patch | Prefer `index.css`. Do not rewrite 09/13 wholesale. |
| D4 | Residual product-doc mentions of creator VIP may still lag; the Prisma table is gone. Prefer schema + `03` catalog. Partially corrected Sep 2026 (glossary, payments agent, 00-status, 10-roadmap, 03). | `rg CreatorSubscription schema.prisma` → none | Do not invent the model. |

## Maintenance

Add an entry when you find drift you are not fixing, with evidence and a risk note. Remove it in the
PR that fixes it. An entry with no evidence path is not an entry.
