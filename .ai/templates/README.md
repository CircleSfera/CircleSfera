# Templates

Skeletons for the artifacts this project produces. Copy, fill, delete the guidance comments.

| Template | Produces | Goes to |
| --- | --- | --- |
| [`adr.md`](./adr.md) | Architecture Decision Record | `circlesfera-documentation/adr/NNNN-slug.md` + the table in `adr/README.md` |
| [`prd.md`](./prd.md) | Feature specification | The PR description, or `circlesfera-documentation/01`/`04` when it changes product scope |
| [`api-contract.md`](./api-contract.md) | Endpoint contract | The PR description; sync `03-api-detailed-endpoints.md` afterwards |
| [`migration.md`](./migration.md) | Schema change plan | The PR description (`CONTRIBUTING.md` requires migration notes) |
| [`postmortem.md`](./postmortem.md) | Incident postmortem | `circlesfera-documentation/runbooks/` or an issue, and a note in `00-status.md` if the cause was structural |
| [`agent.md`](./agent.md) | A new specialist | `.ai/agents/<role>.md` + the index in `agents/README.md` |
| [`playbook.md`](./playbook.md) | A new workflow | `.ai/playbooks/<name>.md` + the index in `playbooks/README.md` |

Rules that apply to all of them: state facts you verified, mark assumptions as assumptions, and never
present an intention as shipped behaviour.
