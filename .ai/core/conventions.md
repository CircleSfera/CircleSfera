# Conventions

What this repository actually does. Follow the local pattern over your preference.

## Formatting and linting — Biome, not ESLint/Prettier

`biome.json` at the root is the single config. Real settings:

- 2-space indent, LF, line width **80**
- JS/TS: **single quotes**; JSX: **double quotes**
- semicolons always, trailing commas everywhere
- `recommended: true`, with these rules **off**: `noNonNullAssertion`, `useImportType`,
  `noExplicitAny`
- `unsafeParameterDecoratorsEnabled: true` (required for Nest parameter decorators)
- import organization is on via the assist
- Biome respects `.gitignore`

`noExplicitAny` being disabled is not permission to use `any`. `AGENTS.md` forbids unnecessary
`any`; the linter simply will not catch it for you.

Run Biome over your changed files before committing — scoped, not the unscoped root `npm run check`,
which reformats 7 unrelated files today (gap T1 in `known-gaps.md`). The `pre-commit` hook runs
`biome check --write` on staged JS/TS/JSON files and re-stages them, and also blocks committing
`.env*` (except `.env.example`), `storageState.json`, `nginx/.htpasswd`, `scratch/`, deploy job
files, and diffs matching its secret regexes. There is no `pre-push` hook and no `lint-staged`.

## Naming and file layout

**Backend** — `circlesfera-backend/src/<domain>/`:

```text
<domain>.module.ts
<domain>.controller.ts       thin; guards + DTO + delegate
<domain>.service.ts          business rules; injects PrismaService
<domain>.service.spec.ts     unit test next to the code
dto/<verb>-<noun>.dto.ts     create-post.dto.ts, send-message.dto.ts
processors/<name>.processor.ts
```

- Classes `PascalCase`, files `kebab-case`, ESM imports carry the `.js` extension
  (`from '../auth/decorators/requires-plan.decorator.js'`) because the package is ESM with
  `module: NodeNext`. Omitting it breaks the runtime build.
- Guards go in `src/auth/guards/`, decorators in `src/auth/decorators/`.
- Modules must be registered in `src/app.module.ts`.

**Frontend** — `circlesfera-frontend/src/`:

```text
components/<area>/Thing.tsx     PascalCase components, grouped by area
components/ui/                  shared primitives (Avatar, Button, Card, Dialog, Input,
                                PullToRefresh, Select, Switch, Textarea, Tooltip)
pages/Thing.tsx                 one page per route
hooks/useThing.ts               camelCase, use- prefix
stores/thingStore.ts            Zustand store per concern
services/thing.service.ts       API wrapper, exported through services/index.ts
```

- Money is handled in integer cents (`priceCents`, `amountCents`, `lifetimeEarningsCents`) —
  never floats.
- Prisma models are `PascalCase` singular with explicit `@@map` to snake_case plural tables
  (`Post` → `posts`, `CreatorSubscription` → `creator_subscriptions`).

## API conventions

- Global prefix `api/v1` (`src/main.ts`). Routes are declared without it in controllers.
- Error shape comes from `AllExceptionsFilter`:
  `{ statusCode, timestamp, path, message, details }`. There is no central error-code enum; some
  flows return semantic payloads inside the message (`ACCOUNT_SUSPENDED`, `ACCOUNT_BANNED` with an
  `appealToken`). Preserve those exact strings — the frontend branches on them.
- List endpoints paginate with `common/dto/pagination.dto.ts` and `createPaginatedResult`.
- Auth is cookie-first (`access_token`), Bearer as fallback; non-GET requests need
  `x-csrf-token`.
- Swagger decorators are used on public controllers; keep them accurate.

## Internationalization

User-facing frontend strings go through `react-i18next`, with keys added to **both**
`src/locales/en.json` and `src/locales/es.json`. `en` is the fallback. Do not hardcode Spanish or
English copy in components.

## Comments

Comment the non-obvious constraint, never the obvious mechanic. No commented-out blocks left
behind, no debug `console.log`, no "changed by AI" notes. `AGENTS.md` is explicit about this.

## Tests

- Backend unit: `src/**/*.spec.ts`, Vitest, run with `npm test`.
- Backend e2e: `test/*.e2e-spec.ts`, needs Postgres + Redis, `fileParallelism: false`.
- Frontend: `src/**/*.{test,spec}.{ts,tsx}`, Vitest + Testing Library, setup in
  `src/test/setup.ts` (mocks `matchMedia`, `IntersectionObserver`, `react-i18next`).
- Playwright: `e2e/*.spec.ts` at the root, `baseURL` `http://localhost:5173`.

Coverage thresholds are deliberately low (statements/lines 30%). That is a floor, not a target, and
not an excuse to skip tests on logic you changed.

## Git and PRs

- Branches: `cursor/<descriptive-name>` for agent work; no other convention is documented.
- Commits: clear, imperative, explain **why**. Conventional Commits are welcome but not required
  (`CONTRIBUTING.md`). One logical change per commit.
- PRs: focused. Split schema, auth/payments and large UI changes. Schema/API/auth/monetization
  changes need explicit rationale and migration notes.
- `CHANGELOG.md` follows Keep a Changelog; user- or operator-visible changes go under
  `[Unreleased]`.
- Never commit secrets. Never commit `storageState.json`.

## Documentation

- Product/technical narrative: `circlesfera-documentation/01`–`12`.
- Durable decisions: `circlesfera-documentation/adr/NNNN-slug.md`, linked from `adr/README.md`
  (template: [`../templates/adr.md`](../templates/adr.md)).
- Operational procedures: `circlesfera-documentation/runbooks/`.
- Agent context: `.ai/` — keep it derived, never canonical.
