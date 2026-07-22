# Documentation status

**Last status note:** Jul 2026 remediation pass

Documents **01–08** (Abr 2026) are **partially stale** relative to the current `schema.prisma` and backend modules.

Verified gaps vs Abr 2026 snapshots include (non-exhaustive):

- **Appeals** — modeled and implemented; older docs may omit or under-specify them
- **Mutes** — present in schema/product; may be missing from older PRD/ER/API text
- **CreatorSubscription** — exists in schema and creator flows; older monetization/API docs lag
- **Live**, **Polls / interactive**, and related domains — prefer Nest controllers + schema over doc 03

When in doubt: `schema.prisma` → implemented code → API contracts → these markdown files.

## Production infra (current)

- Deploy target: OVH VPS via GitHub Actions + `docker-compose.prod.yml`.
- **TLS/SSL**: certificates are generated and renewed **on the VPS host**; the compose nginx proxy is HTTP-only behind the host reverse proxy.
- Doc **05-deployment-strategy** still describes a longer-term target (Cloudflare/ECS/etc.) and should not be read as the live topology.
