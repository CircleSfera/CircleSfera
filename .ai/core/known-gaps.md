# Known gaps and drift

Contradictions found while deriving `.ai/core/` from the repository on **2026-07-27**. They are
recorded here so agents do not mistake them for intentional patterns, and do not "helpfully" change
them without an owner.

**How to use this file:** if your task touches an entry, mention it. If your task *is* an entry, fix
it deliberately with tests and remove the entry in the same PR. Do not batch unrelated fixes.

## Backend

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| B1 | `src/instrument.ts` duplicates the Sentry init but is imported nowhere and is not preloaded in `nest-cli.json`. The effective init is in `src/main.ts`. | `rg instrument` returns no importer | Low. Dead code that looks authoritative; editing it changes nothing. |
| B2 | The 20% platform fee is hardcoded as `0.2` / `0.8` / `application_fee_percent: 20.0` across `monetization.service.ts`, `payments.service.ts`, `live.service.ts`, `creator-subscriptions.service.ts`. No shared constant. | see the four files | Medium. A fee change must be applied in every site consistently, and the local 80% ledger credit must stay in sync with the Stripe fee. |
| B3 | `profiles.service.ts` (lines ~99 and ~367) resolves verification by looking for a plan whose name contains `'Verified'`. No seeded plan contains that substring (`Premium`, `Elite Creator`, `Business`). | `prisma/seed.ts`, `scripts/setup-stripe-products.ts` | Medium. Likely dead branch; changing it changes who appears verified. Needs a product decision, not a silent fix. |
| B4 | `@RequiresPlan` is only used in `src/creator/creator.controller.ts` (always `Elite Creator`). The plan hierarchy is a literal array in `subscription.guard.ts`. | `rg RequiresPlan` | Low. Gating is narrower than the plan catalogue suggests; do not assume other surfaces are gated. |
| B5 | Prisma CLI is **7.6.0** while `@prisma/client` and `@prisma/adapter-pg` are **7.8.0**. | `circlesfera-backend/package.json` | Low–medium. Generator/CLI skew can produce confusing migration output. |
| B6 | No repository layer, no mappers, no domain event bus. Ownership checks are duplicated inline per service. | `rg Repository` in `src/` finds none | Accepted architecture. Listed so agents stop proposing layers. Ownership duplication is real debt. |
| B7 | No centralized error-code enum; some flows encode semantics in the message (`ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED`). The frontend branches on those strings. | `jwt.strategy.ts`, `auth.service.ts` | Medium. Renaming a message is a breaking API change. |
| B8 | The PR CI `test` job runs backend `lint` + `test` but not `nest build`; the backend typecheck only happens in the Playwright job. | `.github/workflows/pr.yml` | Medium. Type errors can survive the main job. Run `npm run build` locally. |

## Frontend

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| F1 | `tailwind.config.js` nests `aspectRatio` **inside `colors`**, so `aspect-4/5` and `aspect-9/16` are almost certainly not generated as intended. | `circlesfera-frontend/tailwind.config.js` | Low, but any fix changes generated CSS — verify affected layouts visually. |
| F2 | The Vite dev proxy targets `http://localhost:3005` while `src/services/api.ts` falls back to `http://localhost:3000` when `VITE_API_URL` is unset. | `vite.config.ts`, `services/api.ts` | Low. A confusing local-setup trap. |
| F3 | `src/App.css` exists but is imported nowhere. | `rg "App.css"` finds no import | Low. Dead file. |
| F4 | `tailwind-merge` is a dependency and appears in `manualChunks` but is not imported in `src/`. | `package.json`, `vite.config.ts` | Low. Dead weight in the bundle config. |
| F5 | Two focus-trap implementations: `src/hooks/useFocusTrap.ts` and `src/components/admin/useFocusTrap.ts`. | both files | Low–medium. Duplicated a11y logic drifts. |
| F6 | No list virtualization anywhere; long feeds rely on infinite scroll plus `content-visibility`. | no virtualization package installed | Medium at scale. A real perf decision, not an oversight to fix in passing. |
| F7 | `Input.tsx` renders an error message without `aria-invalid` / `aria-describedby`; `Button.tsx` has focus rings but no default ARIA. | `src/components/ui/` | Medium for accessibility conformance. |
| F8 | Design-system drift: `Button.tsx` uses `bg-blue-600` instead of the brand tokens in `index.css`. Already flagged in `09-design-system.md`. | `src/components/ui/Button.tsx` | Medium. Visible inconsistency; fix belongs in a scoped design-system PR. |
| F9 | Frontend TypeScript is **5.9.3** while the backend is **6.0.3**. | both `package.json` files | Low. Behaviour can differ across the shared package. |
| F10 | `@playwright/test` is a frontend devDependency but Playwright only has a config at the repo root. | `circlesfera-frontend/package.json` | Low. Redundant dependency. |

## Tooling and CI

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| T1 | Root `npm run check` (`biome check --write .`) currently reformats **7 files nothing in CI covers**: `circlesfera-backend/prisma/seed.ts`, `e2e/happy-path.spec.ts`, `e2e/live-gifts.spec.ts`, `e2e/live.spec.ts`, `e2e/monetization.spec.ts`, `e2e/settings.spec.ts`, `scripts/diagnose-message-crypto.mjs`. PR CI only runs `biome lint .` inside `circlesfera-backend`, `circlesfera-frontend` and `circlesfera-shared`, which checks lint rules but not formatting, and never covers `prisma/`, `e2e/` or `scripts/`. | `npx biome ci .` at root; `.github/workflows/pr.yml` has no root Biome step | Medium for review hygiene. Running the root script pollutes an unrelated diff with 7 reformatted files. Scope Biome to your changed paths, or fix all 7 in a dedicated formatting PR. |

## Documentation

| # | Finding | Evidence |
| --- | --- | --- |
| D1 | Docs `01`–`07` are Abr 2026 snapshots patched in Jul 2026; `00-status.md` states they may lag. Prefer schema + controllers. | `00-status.md` |
| D2 | `11-backups-strategy.md` mixes shipped scripts with aspirational WAL/PITR and named S3 buckets. Do not treat the aspirational parts as existing infrastructure. | `11-backups-strategy.md` |
| D3 | `circlesfera-shared` interfaces are hand-written, not generated from Prisma, and cover only part of the domain (5 enums, ~21 interfaces, 7 DTOs). They can drift from the schema. | `circlesfera-shared/src/` |
| D4 | `circlesfera-landing/` still exists on disk with a Dockerfile while being deprecated and unreferenced by any pipeline. | `circlesfera-landing/README.md`, workflows |

## Maintenance

Add an entry when you find drift you are not fixing, with evidence and a risk note. Remove it in the
PR that fixes it. An entry with no evidence path is not an entry.
