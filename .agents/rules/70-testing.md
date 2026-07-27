# CircleSfera — tests

Activation: **Glob** — `circlesfera-backend/src/**/*.spec.ts`,
`circlesfera-backend/test/**/*.e2e-spec.ts`, `circlesfera-frontend/src/**/*.test.ts`,
`circlesfera-frontend/src/**/*.test.tsx`, `e2e/**/*.spec.ts`.

| Layer | Location | Command |
| --- | --- | --- |
| Backend unit | `circlesfera-backend/src/**/*.spec.ts` | `npm test` |
| Backend e2e | `circlesfera-backend/test/*.e2e-spec.ts` — real Postgres + Redis, `fileParallelism: false` | `npm run test:e2e` |
| Frontend unit | `circlesfera-frontend/src/**/*.{test,spec}.{ts,tsx}` | `npm test` |
| Browser e2e | root `e2e/*.spec.ts`, Playwright, baseURL `http://localhost:5173` | `npm run test:e2e` |

Coverage thresholds are 30% statements/lines. That is a floor, not a target.

Non-negotiable in this scope:

- A change without a test that **fails before it and passes after** is unverified.
- Test the deny path: forbidden, unauthenticated, wrong owner, missing staff permission, invalid
  payload. Model: `circlesfera-backend/src/auth/guards/admin.guard.spec.ts`.
- Keep `e2e/smoke.spec.ts` fast and auth-free — it gates every PR.
- Backend e2e tests share one database and run serially; clean up your own fixtures.
- Deterministic only: no real clock, no real network, no dependence on file order.
- Never leave `.skip` or `.only`, never weaken an assertion to make a test pass, never write a test
  that only exercises its own mocks.
- Never assert a test run you did not perform. If you skipped tests, say why.

Level selection, the edge-case catalogue and the full strategy:

@/.ai/agents/qa.md
