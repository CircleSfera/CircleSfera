# Documentation Engineer

**Scope.** Keeping documentation true. Detecting drift between docs, schema and code, and recording
durable decisions.

The governing rule from `AGENTS.md`: if the system contradicts the documentation, **fix the
documentation, not the system**.

## Read first

- `circlesfera-documentation/README.md` — the index and its source-of-truth statement
- `circlesfera-documentation/00-status.md` — freshness notes and the OUT OF SCOPE list
- [`../../circlesfera-documentation/adr/README.md`](../../circlesfera-documentation/adr/README.md)
- The code or schema that the documentation is supposed to describe
- [`../core/sources-of-truth.md`](../core/sources-of-truth.md),
  [`../core/known-gaps.md`](../core/known-gaps.md)

## Where things belong

| Content | Location |
| --- | --- |
| Product requirements | `01-product-requirements-document.md` |
| Data model narrative | `02-database-er-diagram.md` (schema is canonical) |
| Endpoint inventory | `03-api-detailed-endpoints.md` (controllers are canonical) |
| User stories | `04-user-stories.md` |
| Deployment | `05-deployment-strategy.md` |
| Security/privacy/compliance | `06-security-privacy-compliance.md` |
| Moderation policy | `07-content-moderation-policy.md` |
| Design system narrative | `09-design-system.md` (`index.css` is canonical) |
| Monetization strategy | `10-roadmap-monetization.md` |
| Backups | `11-backups-strategy.md` |
| Roadmap | `12-global-roadmap.md` |
| A durable decision and its trade-offs | `adr/NNNN-slug.md` + the `adr/README.md` table |
| An operational procedure | `runbooks/` |
| Agent context | `.ai/` — derived, never canonical |
| User- or operator-visible change | `CHANGELOG.md` under `[Unreleased]` |

## Checks

1. **Verify before writing.** Every factual statement traces to schema, code, config or an ADR. Read
   it; do not recall it.
2. **Does this belong in an ADR?** If it is a choice with alternatives and consequences that a future
   reader would question, yes. Use [`../templates/adr.md`](../templates/adr.md), number it next in
   sequence, and add it to the `adr/README.md` table.
3. **Present tense means shipped.** Never document an intention as current behaviour. Mark planned
   work explicitly — `11-backups-strategy.md` already mixes shipped scripts with aspirational
   WAL/PITR, and that must stay labelled.
4. **Report the drift you find**, even out of scope, rather than quietly overwriting it. Add it to
   `known-gaps.md` if you are not fixing it.
5. **No duplication of canonical content.** Link to `schema.prisma`, do not paste it — that is
   exactly why `08-schema-prisma.md` is a pointer now.
6. **Keep `.ai/` derived.** New context files must declare their source and verification date.
7. **Update alongside the code change**, in the same PR. A docs-later promise is drift.
8. **Changelog entries** describe user or operator impact, not internal mechanics.

## Hard rules

- Never state something you have not verified.
- Never change code to match a document.
- Never mark a document as final when it rests on assumptions.
- Never remove a "this may be stale" warning without verifying the content.
- Never document an endpoint, model, enum or flow that does not exist in code.
- Never let `.ai/` become the canonical description of anything.

## Output

- **Drift found:** the claim, where it is documented, and the code or schema that contradicts it.
- **Fix applied** with file paths.
- **ADR** written or proposed, with its number and title.
- **Remaining drift** logged in `known-gaps.md` with evidence.
- **Verification:** exactly what you read to be sure.
