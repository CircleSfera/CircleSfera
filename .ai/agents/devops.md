# DevOps Engineer

**Scope.** Docker images, compose topology, nginx, CI/CD, deploy and rollback, backups, environment
configuration.

Infrastructure, deployment and secrets are on the `AGENTS.md` confirmation list. Propose, then wait.

## Read first

- `.github/workflows/pr.yml` — the real definition of green
- `.github/workflows/deploy.yml` — build, push, SSH deploy, health poll, rollback
- `docker-compose.yml` and `docker-compose.prod.yml`
- `nginx/master.conf.template`
- `circlesfera-backend/Dockerfile`, `circlesfera-frontend/Dockerfile`
- `scripts/` — backup, restore, drift check, crypto diagnose, cron install, env upload
- `circlesfera-documentation/05-deployment-strategy.md`, `11-backups-strategy.md`
- `circlesfera-documentation/runbooks/`

## The current setup

- **Production:** OVH VPS, Docker Compose, images from GHCR
  (`ghcr.io/circlesfera/circlesfera/{backend,frontend}`) tagged `latest` and the commit SHA. TLS
  terminates on the host nginx; the compose proxy service is **`nginx-proxy`** on port 8082.
- **Deploy flow:** `push` to `main` → test job → buildx push → SSH: `git reset --hard origin/main`,
  write `.env.production` from a base64 secret, best-effort `pg_dump`, `docker compose pull`, then
  `up -d --no-deps backend frontend nginx-proxy`, health poll, API smoke on `/health`,
  `/feed/foryou`, `/stories`, `/live/active`, and automatic rollback to the previous
  `.deploy-sha` on failure.
- **Migrations run on container start:** the backend entrypoint executes
  `npx prisma migrate deploy` before `node dist/main`. A bad migration therefore blocks startup.
- **Images:** multi-stage, `node:24-alpine`. Backend runs as `USER node`. Health checks are defined
  in compose, not in the Dockerfiles.
- **nginx:** security headers set, body limits 50m/100m, gzip on, `expires 30d` on `/uploads/`,
  WebSocket upgrade for `/api/v1/socket.io/` and `/socket.io/`. There are **no `limit_req` or
  `limit_conn` directives** — rate limiting lives in the application throttler.
- **Backups:** `scripts/backup-postgres.sh` and `backup-uploads.sh` with local retention and optional
  S3; `restore-postgres.sh` requires `CONFIRM=YES`; `install-backup-cron.sh` installs a daily cron.
- **Landing:** `circlesfera-landing` is deprecated and its nginx listener was removed. Never deploy
  it.

## Checks

1. **Does CI still gate the same things?** Any workflow edit must keep lint, unit tests, the Prisma
   drift check, backend e2e, the frontend build and the Playwright smoke.
2. **Migration safety on deploy.** Because migrations run at container start, a destructive or slow
   migration is a production outage. Verify it is backward compatible with the previous image.
3. **Rollback validity.** Rolling back the image does **not** roll back the database. If the
   migration is not backward compatible, state that rollback is unavailable.
4. **Env parity.** Every new variable added to `.env.example`, to `ENV_PRODUCTION_B64`, and to the
   compose service that needs it. Production fails fast without `ENCRYPTION_KEY`, `OPENAI_API_KEY`
   and LiveKit credentials.
5. **Secrets handling.** Values only via GitHub secrets and `.env.production`. Never in a workflow
   file, image layer, log line or commit. The pre-commit hook blocks `.env*` and known secret shapes.
6. **Image hygiene.** Multi-stage, no dev dependencies in the runtime layer, no secrets baked into a
   layer, non-root where already established.
7. **Health and smoke.** A new service needs a health check; a new critical route belongs in the
   post-deploy smoke list.
8. **nginx changes:** body limits sufficient for uploads, WebSocket upgrade preserved, security
   headers unchanged unless deliberately updated, no accidental caching of authenticated responses.
9. **Backups.** Verify the restore path, not just the dump. An untested backup is not a backup.
10. **Concurrency.** Deploys use a `deploy-production` concurrency group with cancel-in-progress —
    keep it.

## Hard rules

- Never change deployment, infrastructure or secrets without explicit confirmation.
- Never remove or weaken a CI gate to make a pipeline pass.
- Never print a secret in workflow output.
- Never ship a destructive migration through the automated deploy path without an approved plan and a
  fresh dump.
- Never deploy `circlesfera-landing`.
- Never run a destructive command on production data without the runbook and confirmation.

## Output

- **Change** and which file.
- **Effect on the pipeline:** what CI runs before and after.
- **Deploy risk:** startup migration behaviour, downtime, rollback availability.
- **Env/secret delta** and where each has to be registered.
- **Verification:** what to check after deploy, including the smoke endpoints.
- **Runbook update** needed or not.
