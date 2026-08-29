# Ops runbooks

Operational stubs for CircleSfera. Prefer the real scripts under [`scripts/`](../../scripts/) over ad-hoc SSH commands.

| Runbook | Purpose | Primary artifact |
| --- | --- | --- |
| [admin-panel-cutover](./admin-panel-cutover.md) | Bootstrap AdminIdentity + MFA after Admin Panel deploy | `scripts/bootstrap-admin.ts`, nginx `admin.circlesfera.com` |
| [restore-postgres](./restore-postgres.md) | Restore PostgreSQL from a backup | `scripts/restore-postgres.sh`, `scripts/backup-postgres.sh` |
| [rollback-deploy](./rollback-deploy.md) | Roll back a bad production deploy | GitHub Actions deploy workflow, previous image/tag |
| [profile-migration-p3009](./profile-migration-p3009.md) | Unblock failed User→Profile ownership migration (P3009) | `scripts/prisma-migrate-deploy.sh`, migration `20260827160002` |
| [incident-response](./incident-response.md) | First response checklist for production incidents | Logs, health endpoints, backups |

Also see:

- `npm run smoke:profile-drift` — API smoke for User/Profile admin response shapes (`scripts/validate-profile-drift-smoke.mjs`); see [15-identity-profile-model.md](../15-identity-profile-model.md)
- `scripts/backup-uploads.sh` — media/uploads backup
- `scripts/upload-prod-env.sh` — production env upload (secrets-sensitive)
- `circlesfera-documentation/05-deployment-strategy.md`
- `circlesfera-documentation/11-backups-strategy.md`
