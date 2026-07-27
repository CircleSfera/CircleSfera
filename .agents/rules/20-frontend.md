# CircleSfera — frontend (React 19)

Activation: **Glob** — `circlesfera-frontend/src/**/*.ts`, `circlesfera-frontend/src/**/*.tsx`.

Server state belongs to TanStack Query. Client and UI state belongs to Zustand. Never mirror server
data into a store.

Non-negotiable in this scope:

- Every request goes through a domain service in `src/services/*.service.ts` using the single
  `ApiClient` in `src/services/api.ts` (credentials, `x-csrf-token`, the 401 → refresh → logout
  path). Never call `fetch` or `axios` from a component.
- Auth is httpOnly cookies. Never read, write or store a token client-side.
- `AuthGuard` / `AdminGuard` / `CreatorStudioGuard` are UX, never security. The server decides.
- Every user-facing string goes through `useTranslation`, with the key added to **both**
  `src/locales/en.json` and `src/locales/es.json`.
- List mutations must invalidate every affected query key; keys are ad-hoc strings, so match the
  domain's existing shape rather than inventing one.
- `npm run build` (`tsc -b && vite build`) is the frontend typecheck.

Data flow, optimistic updates, routing, states and the full checklist:

@/.ai/agents/frontend.md
