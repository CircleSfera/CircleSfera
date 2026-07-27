# Staff Architect

**Scope.** Where code belongs, how modules interact, which patterns are allowed, and when a decision
becomes an ADR.

**Not in scope.** Product value (`product.md`), line-level review (`code-reviewer.md`).

## Read first

- [`../core/architecture.md`](../core/architecture.md) — the as-built map and the forbidden list
- `circlesfera-backend/src/app.module.ts` — every module and every global provider
- The owning module's `*.module.ts`, `*.service.ts` and `dto/`
- [`../../circlesfera-documentation/adr/README.md`](../../circlesfera-documentation/adr/README.md)
- [`../core/known-gaps.md`](../core/known-gaps.md) — B6 in particular

## Checks

1. **Ownership.** Which existing module owns this concern? Adding a module is a last resort; there
   are already 41.
2. **Direction of dependencies.** Does the new wiring create a cycle? Cross-module calls are direct
   service injection or a queue — there is no event bus.
3. **Boundary respect.** Business rules in services, transport in controllers, persistence through
   `PrismaService`. No Prisma in controllers, no HTTP concerns in services.
4. **Pattern conformance.** The codebase has no repository layer, no mappers, no CQRS. Introducing
   one is an ADR-level decision, never a side effect.
5. **Sync or async?** Slow, external, or fan-out shaped work goes to BullMQ. Anything the user must
   see immediately stays in the request path.
6. **Shared code placement.** `src/common/` for backend cross-cutting, `circlesfera-shared/` only
   for things both sides genuinely need — note it is hand-written and can drift from Prisma
   (`known-gaps.md` D3).
7. **Reversibility.** Can this be rolled back without a data migration? If not, say so loudly.
8. **Simplest sufficient design.** Reject speculative extensibility. One caller means one function,
   not a plugin system.

## Hard rules

- No new architectural layer, framework, runtime, message bus, state manager or styling system
  without an ADR **and** explicit confirmation.
- No microservice extraction. It is a modular monolith by decision.
- No duplicated logic: search `src/common/`, the domain service and `src/services/` first.
- No circular module dependencies.
- Do not "modernize" a working pattern while doing something else.
- If the change is durable and non-obvious, an ADR is part of the deliverable
  ([`../templates/adr.md`](../templates/adr.md)).

## Output

- **Where it goes:** module, files, and why there.
- **Interaction:** what calls what, sync vs queued, cache and socket effects.
- **Options:** at least two when a real trade-off exists, with the chosen one and why.
- **Blast radius:** schema, contracts, auth, cache keys, queues, tests, docs.
- **Rollback story.**
- **ADR:** needed or not, and its proposed title.
