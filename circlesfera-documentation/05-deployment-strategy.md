# 05-Deployment-Strategy
## CircleSfera
**Version:** 3.1 — current production vs future target  
**Date:** July 2026  
**Source of truth:** live OVH stack + `docker-compose.prod.yml` + `.github/workflows/deploy.yml`

---

## 0. How to read this document

| Horizon | Status | Topology |
| -------- | ------ | -------- |
| **Current production** | **In use** | OVH VPS, Docker Compose, GitHub Actions, host-terminated TLS |
| **Future target** | **Not in use yet** | Cloudflare + ECS/AWS (or equivalent). Planned later; do not treat as live |

Cloudflare Pages, ECS Fargate, RDS, ElastiCache, etc. appear below only as a **future** option. Operators and agents must not assume they are deployed today.

---

## 1. Objective

Document how CircleSfera is deployed **today**, and separately record a longer-term cloud topology that may be adopted later. The stack includes media, feeds, stories, chat, Stripe, notifications, search, and pgvector embeddings — all already running on the current VPS composition.

---

## 2. Current production (OVH VPS) — source of truth

### 2.1 Topology

- **Host:** OVH VPS.
- **Orchestration:** `docker-compose.prod.yml` (Postgres/pgvector, Redis, NestJS backend, Vite/nginx frontend, compose nginx proxy on HTTP).
- **CI/CD:** GitHub Actions workflow `Deploy to OVH VPS` on push to `main` (lint/tests, Prisma schema↔migration check, build/push GHCR images, SSH deploy, post-deploy API smoke).
- **TLS/SSL:** certificates generated and renewed **on the VPS host** reverse proxy. The compose nginx service only listens on HTTP (e.g. `8082→80`) behind that host proxy.
- **Secrets:** `.env.production` on the VPS (often written from `ENV_PRODUCTION_B64` at deploy time).
- **Migrations:** `prisma migrate deploy` in the backend container entrypoint before Nest boots.
- **Media:** uploads volume / Cloudinary (or S3-compatible) as configured in env — not Cloudflare R2 in the current default.

### 2.2 Local development

- `docker-compose.yml` for Postgres, Redis, backend, frontend.
- Stripe test mode and local env files (never commit secrets).

### 2.3 What “healthy deploy” means today

1. Backend container `running` + Docker healthcheck `healthy`.
2. Post-deploy smoke against nginx: `/api/v1/health`, `/feed/foryou`, `/stories`, `/live/active` must not return 5xx.
3. Schema drift check in CI: migrations must match `schema.prisma` before images are built.

---

## 3. Future target architecture (not deployed)

> **Deferred.** Do not implement or operate as if this were production until product explicitly migrates off the OVH VPS.

### 3.1 Layers (aspirational)

- Cloudflare for DNS, CDN, WAF, and DDoS protection.
- Web frontend on static hosting/CDN.
- NestJS backend in containers.
- Managed PostgreSQL as the primary database.
- Redis for cache, queues, and ephemeral operations.
- S3/R2-compatible object storage for media.
- Stripe as the billing provider.
- Transactional email provider.

### 3.2 Possible cloud mapping (later)

- **Frontend**: Cloudflare Pages or S3 + CloudFront.
- **Backend**: ECS Fargate (or similar managed containers).
- **PostgreSQL**: RDS PostgreSQL (EU region preferred).
- **Redis**: ElastiCache Redis.
- **Media**: Cloudflare R2 or S3.

A balanced future option is **Cloudflare + ECS Fargate + RDS + ElastiCache + R2/S3**, to reduce hand-operated load versus a single VPS — only when the team chooses that migration.

---

## 4. Regions and data residency

### 4.1 Recommended regions (when on managed cloud)

- Primary: EU, preferably `eu-west-1` or `eu-central-1`.
- Future secondary: another EU region for DR.
- Avoid using a US region as primary if regulatory focus is the EU.

### 4.2 Residency rule

If CircleSfera processes European user data and wants a strong compliance posture, primary user data, profiles, messages, reports, and billing metadata must reside in the EU. This affects the database, backups, logs, and email or analytics providers. Validate legally with DPAs and transfer flows.

**Today on OVH:** keep the VPS and backups in an EU location consistent with this rule.

---

## 5. Environments

### Development
- Local Docker Compose.
- Local PostgreSQL + Redis.
- Stripe test mode.

### Staging (optional / when available)
- Infrastructure as close as practical to production.
- Separate database and Stripe test keys.

### Production (current)
- OVH VPS + Compose as in §2.
- Observability and backups as implemented on that host (see also backups doc; treat AWS-specific wording there as future-oriented where it conflicts).

---

## 6. Backend deployment (applies to current Compose and any future container host)

### 5.1 Packaging

The NestJS backend must be deployed as a Docker container. It must not depend on manual deployments onto servers without a repeatable pipeline.

### 5.2 Runtime strategy

- At least 2 tasks in production to avoid a single point of failure.
- Horizontal auto-scaling by CPU, memory, and latency, but with conservative initial limits.
- Separate tasks for workers/queues if you process media, story expiration, notifications, or embedding jobs.

### 5.3 Recommended workers

Separate these jobs from the main API:

- Image and thumbnail processing.
- Video processing.
- Story expiration and cleanup.
- Email sending.
- Stripe webhook processing.
- Notification retries.
- Embedding generation if enabled.

---

## 6. Database

### 6.1 Engine and extensions
- Managed PostgreSQL.
- `pgvector` extension enabled for `PostEmbedding`.

### 6.2 Migrations

The previous strategy mentioned TypeORM. That is corrected: CircleSfera uses Prisma, so migrations must be run with Prisma Migrate.

**Reference commands**
```bash
npx prisma migrate deploy
npx prisma generate
```

### 6.3 Migration deployment rules
- Never generate migrations in production.
- Migrations are generated in development and reviewed in PRs.
- They are tested in staging before production.
- Every destructive migration requires a rollback plan or an expand-contract migration.

### 6.4 Backups
- Daily automatic snapshots.
- PITR enabled.
- Regular restore tests.
- Retention adjusted to risk and cost.

---

## 7. Redis and queues

Redis must not be seen only as a cache. In CircleSfera it also makes sense for:

- Rate limiting.
- Jobs and queues.
- Presence/transient online state.
- Invalidation of sessions or revoked tokens.
- Cache for feed and hot profiles.

If volume grows, separating cache from queue may be reasonable, but it is not mandatory at the start.

---

## 8. Media pipeline

### 8.1 Real product needs
CircleSfera already models posts with media, stories, chat with media, avatars, and thumbnails. The media strategy cannot be a minor add-on.

### 8.2 Recommended pipeline
1. Initial upload to a private bucket or signed URL.
2. Real MIME and size validation.
3. Antivirus scan.
4. Basic automated moderation.
5. Variant generation (`standard`, `thumbnail`).
6. Metadata persistence in PostgreSQL.
7. Delivery via CDN with signed or controlled URLs as appropriate.

### 8.3 Tradeoffs
- **Private bucket + signed URLs**: better control, more complexity.
- **Public bucket with hard-to-guess paths**: worse security, less complexity.

For CircleSfera, given social content and messages, **private bucket + controlled signing** is preferable.

---

## 9. CI/CD

### 9.1 Current pipeline (OVH)
- Trigger: push to `main` (and optional `workflow_dispatch`).
- Lint + unit tests (backend; frontend lint on deploy workflow).
- Prisma schema ↔ migrations alignment check (shadow Postgres).
- Build and push images to GHCR.
- SSH deploy on the VPS: pull images, `compose up`, wait for healthy, API smoke (`/health`, feed, stories, live).
- Slack webhook notifications when configured.

### 9.2 Future enhancements (optional)
- Dedicated staging environment and manual approval before production.
- Broader Playwright suite in CI (today e2e is local / optional).
- Image vulnerability scanning as a hard gate.

### 9.3 Branching (practical today)
- `main`: production (direct pushes are the usual path for this repo).
- Feature branches / PRs optional; `pr.yml` still runs lint/tests/build when used.

### 9.4 Rollout policy (current)
- Replace containers via Compose; rely on healthcheck + post-deploy smoke; roll back by redeploying a previous image/commit if smoke fails.

---

## 10. Secrets and configuration

### 10.1 Secret management
- **Today:** GitHub Actions secrets (e.g. `ENV_PRODUCTION_B64`, VPS SSH) and `.env.production` on the VPS (not in git).
- **Future (if migrating to AWS):** AWS Secrets Manager or SSM Parameter Store.

### 10.2 Critical secrets
- `DATABASE_URL`
- JWT secrets
- Stripe secret key
- Stripe webhook secret
- Email API keys
- Redis credentials
- Bucket credentials
- Additional encryption keys if applicable

### 10.3 Operational rule
- Never secrets in git.
- Never secrets in frontend variables.
- Scheduled rotation for sensitive keys.

---

## 11. Observability

### 11.1 Logs
- Structured JSON logs.
- Correlation/request ID per request.
- Separation between app logs and audit/security logs.

### 11.2 Minimum metrics
- API latency p50/p95/p99.
- Error rate per endpoint.
- Throughput.
- Queue lag.
- Media processing time.
- Webhook success/failure rate.
- Story expiration lag.
- DB connections and slow queries.

### 11.3 Critical alerts
- DB connection failure.
- Redis failure.
- API error rate above threshold.
- Stuck jobs.
- Stripe webhook failure.
- CPU/RAM saturation on backend.
- Media processing drop.

---

## 12. Operational security

- Mandatory HTTPS.
- Active WAF.
- Rate limiting per IP and per user.
- Security headers.
- Least privilege access to production resources.
- MFA for critical cloud accounts.
- Administration logs and sensitive change logs.
- Segmentation between public and private services.

---

## 13. Disaster recovery

### Reasonable initial objectives
- RTO: 1-4 hours depending on severity.
- RPO: 15-60 minutes.

### Minimum runbook
- DB restore.
- Webhook revalidation.
- Worker recovery.
- Bucket and signed URL verification.
- Critical smoke tests: auth, posts, stories, chat, billing.

---

## 14. Cost and scaling

The previous strategy was oriented toward a classic social backend, but real cost must now also account for media, chat, and stories. The most sensitive costs will be:

- Media storage and egress.
- Managed Postgres.
- Redis.
- Media/video processing.
- Observability.
- WAF/CDN.

CircleSfera's priority at this stage should not be extreme cost optimization, but avoiding architecture that is expensive to operate and hard to reverse.

---

## 15. Closed decisions

- Any official reference to TypeORM migrations is removed.
- Prisma Migrate is the only documented migration strategy.
- **Current production is OVH VPS + Docker Compose + GitHub Actions**; Cloudflare/ECS/AWS is a **future** target only.
- Infrastructure must support stories, chat, media processing, Stripe webhooks, and pgvector (already on the VPS stack).
- Kubernetes/EKS is not a near-term priority; if leaving the VPS later, prefer ECS Fargate or a managed equivalent.
- European user data must remain on EU infrastructure unless a validated legal and contractual exception applies.
