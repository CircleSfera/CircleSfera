# CircleSfera — backend (NestJS)

Activation: **Glob** — `circlesfera-backend/src/**/*.ts`.

Pattern: **Controller (thin, guards + DTO) → Service (business rules + `PrismaService`) →
Postgres.** There is no repository layer, no mapper layer and no event bus. Introducing one is an
ADR-level decision, not a side effect.

Non-negotiable in this scope:

- Ownership is checked **inside services** (compare the entity's `userId` to the caller, throw
  `ForbiddenException`). There is no generic ownership guard — a new mutation needs a new check.
- Never loosen the global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` in `src/main.ts`).
- ESM: relative imports must carry the `.js` extension or the build breaks.
- Preserve the semantic error strings the frontend branches on (`ACCOUNT_SUSPENDED`,
  `ACCOUNT_BANNED`).
- `npm run build` is the only real backend typecheck — CI's `test` job does not run it.

Architecture, guards, queues, caching and the full checklist:

@/.ai/agents/backend.md
@/.ai/core/architecture.md
