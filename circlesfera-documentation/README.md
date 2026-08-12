# CircleSfera documentation

Index of the **14** product/technical documents (01–14) under `circlesfera-documentation/`.

**Source of truth:** `circlesfera-backend/prisma/schema.prisma` and implemented NestJS/React code supersede snapshots for domains such as **Appeal**, **Mute**, **CreatorSubscription**, **Live**, and **Polls** (interactive). Prefer schema + controllers when docs disagree.

Freshness notes: [00-status.md](./00-status.md). ADRs: [adr/](./adr/). Ops runbooks: [runbooks/](./runbooks/).

AI-assisted engineering context lives outside this folder, in [`.ai/`](../.ai/README.md) (governed by [AGENTS.md](../AGENTS.md)). It summarises and links to these documents; it does not replace them.

> **Diseño sincronizado con Notion (Ago 2026):** Los documentos 09 y 13 reflejan la fuente canónica de diseño en Notion. En caso de conflicto entre ellos y otros documentos, los de Notion prevalecen para decisiones de diseño/UI.
>
> **Tokens shippeados:** nav/avatar sizes en `circlesfera-frontend/src/index.css` están alineados con 09 §9.4–9.5 tras la Ola 1 (ver [14](./14-uiux-improvement-roadmap.md)).

| # | Documento |
| --- | --- |
| 01 | [01-product-requirements-document.md](./01-product-requirements-document.md) |
| 02 | [02-database-er-diagram.md](./02-database-er-diagram.md) |
| 03 | [03-api-detailed-endpoints.md](./03-api-detailed-endpoints.md) — inventario de controladores (Jul 2026) |
| 04 | [04-user-stories.md](./04-user-stories.md) |
| 05 | [05-deployment-strategy.md](./05-deployment-strategy.md) |
| 06 | [06-security-privacy-compliance.md](./06-security-privacy-compliance.md) |
| 07 | [07-content-moderation-policy.md](./07-content-moderation-policy.md) |
| 08 | [08-schema-prisma.md](./08-schema-prisma.md) — puntero a `schema.prisma` en vivo |
| 09 | [09-design-system.md](./09-design-system.md) — **Design System v2.0.0** (sincronizado desde Notion, Ago 2026) |
| 10 | [10-roadmap-monetization.md](./10-roadmap-monetization.md) |
| 11 | [11-backups-strategy.md](./11-backups-strategy.md) |
| 12 | [12-global-roadmap.md](./12-global-roadmap.md) |
| 13 | [13-layout-guidelines.md](./13-layout-guidelines.md) — **Layout Guidelines v1.0.0** (sincronizado desde Notion, Ago 2026) |
| 14 | [14-uiux-improvement-roadmap.md](./14-uiux-improvement-roadmap.md) — roadmap UI/UX (olas Fundación → Consumer → Herramientas → Admin; planned) |

