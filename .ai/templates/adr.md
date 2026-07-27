# ADR-NNNN — <short decision title>

<!--
File: circlesfera-documentation/adr/NNNN-slug.md
Number: next in sequence after the highest existing ADR.
Also add a row to circlesfera-documentation/adr/README.md, and link it from 00-status.md when
relevant. Match the tone of the existing ADRs: short, factual, decision-first.
-->

**Status:** Proposed | Accepted | Superseded by ADR-NNNN
**Date:** YYYY-MM
**Scope:** <backend | frontend | data | infra | product | payments | trust & safety>

## Context

What forced a decision. The constraint, the incident, the scaling limit, the legal requirement. Include
the concrete evidence — file paths, measurements, an incident date — so a future reader can judge
whether the context still holds.

## Decision

One or two sentences stating what we do, in the present tense.

## Alternatives considered

| Option | Why not |
| --- | --- |
| <option> | <reason, specific to this codebase> |

An ADR with no rejected alternatives usually means the decision was not actually made.

## Consequences

**Accepted costs.** What becomes harder, slower or more expensive.

**Constraints this imposes.** What future changes must respect. Be explicit — this is the part later
readers rely on.

**What this does not decide.** Adjacent questions deliberately left open.

## Implementation anchors

Where the decision lives in the code, so drift is detectable:

- `path/to/file.ts` — <what it does>
- `circlesfera-backend/prisma/schema.prisma` — <models involved>

## Revisiting

What new evidence would justify superseding this. If the answer is "nothing foreseeable", say so.
