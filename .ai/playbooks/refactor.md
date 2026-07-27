# Playbook — Refactor

Improving structure with **no observable behaviour change**. If behaviour changes, this is not a
refactor; split it.

Specialists: `refactoring` → `staff-architect` → `code-reviewer` → `qa`.

## 1 — Justify it

Answer honestly: was this asked for, or are you tidying while passing through? Unrequested refactors
inflate diffs and hide the real change. Name the concrete problem — duplication with a second call
site, a function doing four things, a component past ~300 lines, a name that misleads.

If the answer is "it offends me stylistically", stop.

## 2 — Map the system

Before moving anything:

- Every caller of what you will move or rename (search the whole monorepo, including
  `circlesfera-shared` and the frontend).
- Inputs and outputs.
- Side effects in order: database writes, queue jobs, socket emits, cache writes and invalidations,
  external calls, notifications.
- Shared or module-level state.

## 3 — Establish the safety net

Run the existing tests and record that they pass. If the behaviour you are about to move is not
covered, **add tests first, in a separate commit**. Refactoring untested code is guessing.

## 4 — Classify and price the risk

Classification: extract function / extract component / extract hook / extract service / rename /
simplify conditional / remove duplication / inline needless indirection.

| Risk | Meaning | Requirement |
| --- | --- | --- |
| Low | One file, fully covered | Proceed |
| Medium | Several callers in one module, partial coverage | Add tests first |
| High | Crosses modules, or touches auth, money, moderation, feed | Explicit plan, reviewer, tests first |
| Critical | Changes a contract, a schema, or a money path | **Not a refactor.** Stop and re-scope. |

## 5 — Execute in small steps

- One mechanical move per commit where possible.
- Preserve side effects **and their order**.
- Keep the module's established pattern, even if you prefer another.
- Do not introduce a repository layer, mapper layer, CQRS or an event bus — architectural change needs
  an ADR and confirmation ([`../core/architecture.md`](../core/architecture.md)).
- Do not reformat files you did not otherwise touch.
- Remove code that is now dead, or say why you left it.

## 6 — Verify behaviour preservation

```bash
cd circlesfera-backend && npm run lint && npm test && npm run build
cd circlesfera-frontend && npm run lint && npm test && npm run build
cd /workspace && npm run check
```

The same tests that passed in step 3 must pass **unchanged**. If you had to modify a test assertion,
you changed behaviour — stop and say so.

Then check the edges by hand: null, empty, error paths, permission denials, and the flows that touch
the moved code.

## 7 — Report

- **Classification and risk level.**
- **System map:** callers and side effects identified.
- **Safety net:** tests relied on, tests added first.
- **What improved,** concretely: duplication removed with both former call sites named, complexity
  reduced, responsibilities separated. Not adjectives.
- **Proof of preservation:** the unchanged tests, plus manual checks.
- **Debt deliberately left** and why.
