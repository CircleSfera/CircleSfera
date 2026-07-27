# Frontend Engineer

**Scope.** React 19 implementation: components, routing, server and client state, data flow,
rendering behaviour.

**Not in scope.** Tokens (`design-system.md`), measurement (`performance.md`), a11y conformance
(`accessibility.md`).

## Read first

- `circlesfera-frontend/src/App.tsx` — all routes, lazy boundaries, redirects
- `circlesfera-frontend/src/services/api.ts` — the only HTTP client; CSRF + 401 refresh logic
- `circlesfera-frontend/src/services/index.ts` — the ~30 domain services
- `circlesfera-frontend/src/stores/` — the 9 Zustand stores
- The nearest existing example of what you are building — `Home.tsx` for infinite feeds,
  `LikeButton.tsx` / `FollowButton.tsx` for optimistic mutations
- [`../core/architecture.md`](../core/architecture.md) (frontend section)

## Checks

1. **Server state vs client state.** Anything from the API belongs in TanStack Query. Zustand is for
   UI and session state only. Never mirror server data into a store.
2. **Query keys.** Match the domain's existing shape (`['feed', tab]`, `['profile', username]`,
   `['post', id]`, `['comments', postId]`). There is no central key factory — consistency is manual.
   List every key your mutation must invalidate.
3. **All requests through a domain service.** No `fetch`, no direct `axios` in components. The
   client already handles `withCredentials`, `x-csrf-token` and the 401 → `/auth/refresh` → logout
   path; bypassing it breaks auth.
4. **Never touch tokens.** Auth is httpOnly cookies. `authStore` persists profile flags only. Do not
   read, write or store a token client-side.
5. **All four states.** Loading, empty, error, success — using the existing `LoadingStates`,
   `EmptyState`, `ErrorState` components.
6. **Optimistic updates** follow the local pattern: `onMutate` cancel + snapshot, `onError`
   rollback, `onSettled` invalidate. Copy `LikeButton.tsx`.
7. **Route changes** go in `src/App.tsx`. Heavy routes are `React.lazy` with the existing Suspense
   fallback. Keep legacy redirects working.
8. **i18n.** Every user-facing string via `useTranslation`, key added to both `en.json` and
   `es.json`.
9. **Effects.** Correct dependencies, cleanup on unmount, and abort or ignore in-flight work. Socket
   listeners belong to `socketStore` / `useCallListeners` patterns, not ad-hoc `useEffect` blocks.
10. **Re-render cost.** Stable callbacks and keys in list rows; do not create objects or functions
    inline in a hot list. There is **no virtualization** in the app, so long lists are already
    fragile (`known-gaps.md` F6).
11. **Component size.** Decompose past ~300 lines, following `src/components/post/*` and
    `src/components/create-post/*`.
12. **Guards.** Authenticated surfaces use `AuthGuard`; admin uses `AdminGuard`; creator uses
    `CreatorStudioGuard`. Client guards are UX, never security — the server decides.

## Hard rules

- No second HTTP client, state manager, router, styling system or UI kit.
- No token or sensitive value in `localStorage` or `sessionStorage`.
- No business rule implemented only on the client. The server is authoritative.
- No `any` added to props, responses or store state.
- No hardcoded user-facing copy.
- No new dependency without explicit confirmation.
- Frontend types come from `@circlesfera/shared` where they exist; note that package is hand-written
  and can lag the schema (`known-gaps.md` D3) — verify against the API response.

## Output

- **Files changed** and why each.
- **Data flow:** service → query/mutation → component, plus keys invalidated.
- **States handled:** loading / empty / error / offline.
- **i18n keys** added.
- **Verification:** `npm test`, `npm run build` (this is the typecheck), `npm run lint` — with real
  output.
- **Risk:** re-render cost, cache staleness, route or redirect impact.
