# CircleSfera Frontend

React 19 SPA for the CircleSfera consumer app and the **Admin Panel** (host-based routing on `admin.circlesfera.com` in production).

Mobile-first UI (390×844 baseline), high information density. Design tokens and layout rules: [09-design-system.md](../circlesfera-documentation/09-design-system.md), [13-layout-guidelines.md](../circlesfera-documentation/13-layout-guidelines.md).

## Stack

- React 19, Vite 7, TypeScript
- TanStack Query (server state), Zustand (client state)
- Tailwind CSS 4, React Router 7
- Axios with **`withCredentials: true`** (cookie sessions)
- LiveKit components (live), Capacitor (native shell hooks)
- Vitest + Playwright

## Architecture notes

### Auth

Platform auth uses **HTTP-only cookies** managed by the backend — not Bearer tokens in `localStorage`. `authStore` persists profile/session *metadata* only; `checkSession()` validates via `GET /profiles/me` on cold start.

CSRF: fetch `/api/v1/csrf-token` and send `x-csrf-token` on mutating requests.

Admin Panel uses a separate `adminAuthStore` and admin cookie domain ([ADR-0013](../circlesfera-documentation/adr/0013-admin-panel-admin-identity.md)).

### Identity in the UI

- Public routes use **`Profile.username`** (`/:username`, profile cards, mentions).
- Account settings, billing, GDPR: account-scoped APIs under `/users/*`.
- See [15-identity-profile-model.md](../circlesfera-documentation/15-identity-profile-model.md).

### Code layout

```
src/
├── components/     # UI by feature (feed, chat, story, admin, create-post, …)
├── pages/          # Route-level views
├── services/       # Axios API modules per domain
├── stores/         # Zustand (auth, notifications, chat, …)
├── hooks/
├── types/
└── utils/
```

Lazy-loaded routes for heavy surfaces (chat panes, creator studio, admin tabs). Admin UI expects API payloads with nested `user.profile.username` for list rows.

## Getting started

**Prerequisites:** Node 24, running API (Docker compose recommended).

```bash
cd circlesfera-frontend
npm install
cp .env.example .env
npm run dev
```

| Variable | Typical local value |
| --- | --- |
| `VITE_API_URL` | `http://localhost:3000/api/v1` (or `/api/v1` behind nginx on `:8080`) |

With Docker from repo root, frontend dev uses `VITE_API_PROXY_TARGET=http://backend:3000`; browse via **http://localhost:8080** (nginx) or **http://localhost:5173** (Vite direct).

Build shared package first if linking locally: `cd ../circlesfera-shared && npm run build`.

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # production build
npm run preview      # preview production build
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright (frontend config)
npm run lint         # Biome
npm run check        # Biome check --write
```

Root repo also runs Playwright from `/e2e`.

## API integration

Domain modules under `src/services/` (e.g. `posts`, `profiles`, `chat`, `monetization`, `passkey`, `notifications`). Prefer TanStack Query hooks in components; invalidate queries on mutations.

Do not duplicate endpoint lists here — use [03-api-detailed-endpoints.md](../circlesfera-documentation/03-api-detailed-endpoints.md).

## Product surfaces (non-exhaustive)

Consumer: feed (hybrid/following), explore, profiles, stories, frames, chat + calls, live viewer, bookmarks/collections, creator studio, monetization, settings (privacy, appeals, passkeys).

Admin (`admin.*` host): Trust queue, users, content, monetization, live ops, experiments — permission-gated tabs.

## Testing & quality

- Component/page tests: Vitest (`*.test.tsx`)
- E2E: Playwright (`npm run test:e2e`, root `e2e/`)
- Lint/format: Biome (aligned with monorepo root)

## Related docs

- [Frontend backlog / UI roadmap](../circlesfera-documentation/14-uiux-improvement-roadmap.md)
- [04-user-stories.md](../circlesfera-documentation/04-user-stories.md)
- [AGENTS.md](../AGENTS.md) — mobile-first sizing rules

## License

MIT — see [LICENSE](../LICENSE).
