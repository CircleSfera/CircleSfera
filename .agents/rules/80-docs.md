# CircleSfera — documentation

Activation: **Glob** — `circlesfera-documentation/**`, `CHANGELOG.md`, `README.md`,
`CONTRIBUTING.md`.

Governing rule from `AGENTS.md`: if the system contradicts the documentation, **fix the
documentation, not the system.**

Non-negotiable in this scope:

- Verify every factual statement against the canonical artifact before writing it: `schema.prisma`
  for data, controllers for endpoints, the owning service for business rules,
  `circlesfera-frontend/src/index.css` for tokens, the workflows and compose files for deployment,
  the relevant `package.json` for versions.
- Never paste canonical content. Link to it — that is why `08-schema-prisma.md` is only a pointer.
- Present tense means shipped. Mark planned work explicitly and keep the shipped-vs-aspirational
  labelling in `11-backups-strategy.md` intact.
- A durable decision with alternatives and consequences belongs in an ADR at
  `circlesfera-documentation/adr/NNNN-slug.md`, numbered next in sequence and added to the table in
  `adr/README.md`. Template: `.ai/templates/adr.md`.
- Drift you find but do not fix goes in `.ai/core/known-gaps.md` with evidence and a risk note. Do
  not silently rewrite documents you were not asked to touch.
- Never document an endpoint, model, enum or flow that does not exist in code, and never mark a
  document final when it rests on assumptions.
- `circlesfera-landing/` is deprecated and unreferenced by any pipeline. Do not document it as
  active.

Full process:

@/.ai/playbooks/docs-sync.md
