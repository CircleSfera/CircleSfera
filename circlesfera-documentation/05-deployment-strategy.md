# 05-Deployment-Strategy
## CircleSfera
**Version:** 3.0 aligned with the real project  
**Date:** April 2026  
**Source of truth:** real project stack + current schema capabilities

---

## 1. Objective

This document replaces the previous deployment strategy to align it with CircleSfera's real architecture. The main correction is operational: the strategy can no longer assume a small MVP backend without stories, chat, or promotions, and it can no longer mix Prisma with TypeORM migration instructions.

CircleSfera requires infrastructure ready for a social app with media, feeds, stories, chat, Stripe billing, notifications, search, and future support for embeddings with pgvector.

---

## 2. Target architecture

### 2.1 Layers
- Cloudflare for DNS, CDN, WAF, and DDoS protection.
- Web frontend deployed on static hosting/CDN.
- NestJS backend deployed in containers.
- Managed PostgreSQL as the primary database.
- Redis for cache, queues, and ephemeral operations.
- S3/R2-compatible object storage for media.
- Stripe as the billing provider.
- Transactional email provider.

### 2.2 Deployment recommendation

For CircleSfera, a simple and reversible strategy is preferable:

- **Frontend**: Cloudflare Pages or S3 + CloudFront.
- **Backend**: ECS Fargate, or Render/Fly/railway-like only if you need early speed; for serious production, prefer ECS Fargate or EC2 with Docker.
- **PostgreSQL**: RDS PostgreSQL, or Neon/Supabase at a very early stage; for production with more control, RDS.
- **Redis**: ElastiCache Redis.
- **Media**: Cloudflare R2 or S3.

The most balanced option for CircleSfera today is **Cloudflare + ECS Fargate + RDS PostgreSQL + ElastiCache + R2/S3**, because it reduces operational load compared to Kubernetes and avoids dependence on an overly handmade stack.

---

## 3. Regions and data residency

### 3.1 Recommended regions
- Primary: EU, preferably `eu-west-1` or `eu-central-1`.
- Future secondary: another EU region for DR.
- Avoid using a US region as primary if your regulatory and residency focus is the EU.

### 3.2 Residency rule

If CircleSfera processes European user data and wants a strong compliance posture, primary user data, profiles, messages, reports, and billing metadata must reside in the EU. This affects the database, backups, logs, and email or analytics providers. This area touches compliance and must be validated legally with DPAs and real international transfer flows.

---

## 4. Environments

### Development
- Local Docker Compose.
- Local PostgreSQL.
- Local Redis.
- Optional bucket/localstack or mocks.
- Stripe test mode.

### Staging
- Infrastructure nearly identical to production.
- Separate database.
- Stripe test keys.
- Webhooks and email in sandbox.
- Synthetic or anonymized data.

### Production
- Basic high availability.
- Full observability.
- Centralized secret management.
- Automated backups.
- Operational runbooks.

---

## 5. Backend deployment

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

### 9.1 Recommended pipeline
- Lint.
- Unit tests.
- Integration tests.
- `prisma validate`.
- `prisma generate`.
- Backend and frontend build.
- Docker image build.
- Dependency and image scan.
- Deploy to staging.
- Smoke tests.
- Manual approval for production.
- Production deploy.

### 9.2 Branching
- `main`: production.
- `develop`: integration.
- `feature/*`: work in progress.
- `hotfix/*`: urgent fixes.

### 9.3 Rollout policy
- Blue/green or rolling deployment with health checks.
- Fast rollback if smoke tests or key metrics fail.

---

## 10. Secrets and configuration

### 10.1 Secret management
Use a centralized manager, such as AWS Secrets Manager or SSM Parameter Store.

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
- Prisma Migrate becomes the only documented migration strategy.
- Infrastructure must explicitly support stories, chat, media processing, Stripe webhooks, and pgvector.
- Kubernetes/EKS is not an initial priority; ECS Fargate or a managed equivalent is preferred.
- European user data must remain on EU infrastructure unless a validated legal and contractual exception applies.
