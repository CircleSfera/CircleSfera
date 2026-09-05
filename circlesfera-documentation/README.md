# CircleSfera documentation

Product and technical docs for the shipped platform. **Code and schema win** when anything here disagrees.

| Layer | Where |
| --- | --- |
| Freshness / scope | [00-status.md](./00-status.md) |
| Decisions | [adr/](./adr/) |
| Ops | [runbooks/](./runbooks/) |
| AI context (derived) | [`.ai/`](../.ai/README.md) — governed by [AGENTS.md](../AGENTS.md) |
| Fundraising (EN) | [circlesfera-docs/investors/](../circlesfera-docs/investors/) |

## Numbered docs (00–15)

| # | Document | Role |
| --- | --- | --- |
| 00 | [00-status.md](./00-status.md) | Freshness, in development, OUT OF SCOPE |
| 01 | [01-product-requirements-document.md](./01-product-requirements-document.md) | Product philosophy + scope |
| 02 | [02-database-er-diagram.md](./02-database-er-diagram.md) | Data model narrative (`schema.prisma` is canonical) |
| 03 | [03-api-detailed-endpoints.md](./03-api-detailed-endpoints.md) | API conventions + link to generated catalog |
| — | [03-api-catalog.generated.md](./03-api-catalog.generated.md) | Route inventory (`npm run docs:api-inventory`) |
| 04 | [04-user-stories.md](./04-user-stories.md) | Epics / user stories |
| 05 | [05-deployment-strategy.md](./05-deployment-strategy.md) | Current OVH deploy vs future target |
| 06 | [06-security-privacy-compliance.md](./06-security-privacy-compliance.md) | Security / privacy / GDPR |
| 07 | [07-content-moderation-policy.md](./07-content-moderation-policy.md) | Moderation policy |
| 08 | [08-schema-prisma.md](./08-schema-prisma.md) | Pointer only → live `schema.prisma` |
| 09 | [09-design-system.md](./09-design-system.md) | Design System v2 (Notion export) |
| 10 | [10-roadmap-monetization.md](./10-roadmap-monetization.md) | Monetization map (not ledger SoT) |
| 11 | [11-backups-strategy.md](./11-backups-strategy.md) | Backups — shipped vs future |
| 12 | [12-global-roadmap.md](./12-global-roadmap.md) | Master plan / horizons |
| 13 | [13-layout-guidelines.md](./13-layout-guidelines.md) | Layout guidelines (Notion export) |
| 14 | [14-uiux-improvement-roadmap.md](./14-uiux-improvement-roadmap.md) | UI/UX Phase 1 waves (shipped) |
| 15 | [15-identity-profile-model.md](./15-identity-profile-model.md) | User / Profile / AdminIdentity |

## Design notes

- Docs **09** and **13** are Notion-canonical for design/UI narrative. Live tokens: `circlesfera-frontend/src/index.css`.
- Nav/avatar sizes: CSS tokens aligned with 09 sections 9.4–9.5 (Sep 2026). Prefer `index.css` for values.
- Section references use plain numbers (`section 9.4`), not the `§` symbol.

## House style

- Present tense = shipped. Mark planned / in-development work explicitly.
- Never invent models, endpoints, or enums — verify in schema or controllers.
- Prefer links to canonical artifacts over pasted dumps (`08` is the pattern).
