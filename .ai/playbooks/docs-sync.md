# Playbook — Documentation sync

Documentation contradicts reality. The governing rule from `AGENTS.md`: **fix the documentation, not
the system.**

Specialists: `documentation` → the specialist who owns the domain in question.

## 1 — Establish what is true

Read the canonical artifact, not another document:

| Claim about… | Verify in |
| --- | --- |
| Data model | `circlesfera-backend/prisma/schema.prisma` |
| Endpoints | `circlesfera-backend/src/**/*.controller.ts` |
| Business rules | the owning service |
| Design tokens | `circlesfera-frontend/src/index.css` |
| Deployment | `.github/workflows/deploy.yml`, `docker-compose.prod.yml`, `nginx/` |
| Dependencies | the relevant `package.json` |
| Decisions | `circlesfera-documentation/adr/` |

Quote the file and the line. "I believe" is not verification.

## 2 — Classify the drift

- **Doc describes something that never existed.** Remove or correct it, and say so plainly.
- **Doc describes something that was removed.** Correct it and reference why it went — for example
  `payout_requests` was dropped deliberately
  ([ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)).
- **Doc describes an intention as current behaviour.** Relabel it as planned. `11-backups-strategy.md`
  already mixes shipped scripts with aspirational WAL/PITR, and that separation must stay visible.
- **Code is wrong and the doc is right.** This is **not** a docs task. Report it, and open a bug or a
  product question. Never change code to match a document without confirmation.
- **Both are wrong.** Escalate — it is a product decision, not an editing task.

## 3 — Fix in the right place

Put the correction where it belongs
([`../agents/documentation.md`](../agents/documentation.md) has the full map). Key rules:

- Never paste canonical content into a document. Link to it. That is exactly why
  `08-schema-prisma.md` is now a pointer.
- A durable decision belongs in an ADR ([`../templates/adr.md`](../templates/adr.md)), numbered next in
  sequence and added to `adr/README.md`.
- An operational procedure belongs in `runbooks/`.
- Agent context belongs in `.ai/` and must declare its source and verification date.
- Freshness notes belong in `00-status.md`.

## 4 — Do not overreach

Fix the drift in scope. If you find more:

- Record it in [`../core/known-gaps.md`](../core/known-gaps.md) with evidence and a risk note.
- Do not silently rewrite documents you were not asked to touch. A large unrequested docs diff is
  unreviewable, and unreviewed documentation is how drift gets introduced.

## 5 — Verify

- Every corrected statement traces to a file you actually read.
- Internal links resolve.
- No document now claims something as shipped that is not.
- No "may be stale" warning removed without verifying the content behind it.

## 6 — Report

- **Drift found:** the claim, where documented, and the code or schema that contradicts it.
- **Correction applied,** file by file.
- **Drift left,** logged in `known-gaps.md`.
- **Escalations:** anything where the code looks wrong rather than the doc.
- **Verification:** exactly what you read.

## Hard rules

- Never state something unverified.
- Never change code to match a document.
- Never mark a document final when it rests on assumptions.
- Never document an endpoint, model, enum or flow that does not exist.
- Never let `.ai/` become canonical for anything.
