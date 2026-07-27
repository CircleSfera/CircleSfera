# CircleSfera — infrastructure and deployment

Activation: **Glob** — `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/**`, `scripts/**`,
`circlesfera-backend/Dockerfile`, `circlesfera-frontend/Dockerfile`.

Infrastructure, deployment and secrets are on the `AGENTS.md` confirmation list: **propose, then
wait.**

Production is an OVH VPS running Docker Compose with GHCR images tagged `latest` and the commit SHA.
TLS terminates on the host nginx; the compose proxy service is `nginx-proxy` on port 8082. A push to
`main` runs `.github/workflows/deploy.yml`: test job → buildx push → SSH deploy → health poll → API
smoke → automatic rollback to the previous `.deploy-sha` on failure.

Non-negotiable in this scope:

- The backend entrypoint runs `npx prisma migrate deploy` **before** `node dist/main`. A bad
  migration blocks startup, and an image rollback does **not** revert the database.
- Never remove or weaken a CI gate to make a pipeline pass. The PR job keeps lint, backend unit, the
  Prisma drift check, backend e2e, the frontend build and the Playwright smoke.
- Any new environment variable goes into `.env.example`, into `ENV_PRODUCTION_B64`, **and** into the
  compose service that consumes it.
- Never print a secret in workflow output or bake one into an image layer.
- Never ship a destructive migration through the automated deploy without an approved plan and a
  fresh verified dump.
- A new service needs a health check; a new critical route belongs in the post-deploy smoke list.
- Verify a restore path, not just a dump. An untested backup is not a backup.
- Never deploy `circlesfera-landing` — it is deprecated and its nginx listener was removed.

Full topology, nginx behaviour, backups and release process:

@/.ai/agents/devops.md
@/.ai/playbooks/release.md
