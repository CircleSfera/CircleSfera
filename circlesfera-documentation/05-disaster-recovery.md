# Disaster Recovery Runbook & Backup SLAs — CircleSfera

> **Source of Truth:** This document defines the official backup policy, disaster recovery (DR)
> procedures, and Recovery Point/Time Objectives (RPO/RTO) for the CircleSfera platform.
> It establishes mechanical operational continuity and resilience standards.

---

## 1. Recovery Objectives (SLAs)

| Data Component | Classification | Maximum RPO (Recovery Point Objective) | Maximum RTO (Recovery Time Objective) | Backup Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL (Prisma Core)** | Critical | $\le 24$ hours (operational target $\le 1$h with WAL) | $\le 30$ minutes | Logical dump (`pg_dump -Fc`), TOC verification, and off-host replication to S3. |
| **Financial Ledger & Transactions** | Critical / Immutable | RPO = 0 (Zero state loss) | $\le 30$ minutes | ACID transactional database boundaries + Idempotent replay of Stripe webhooks. |
| **Media Storage (`uploads/`)** | High | $\le 24$ hours | $\le 45$ minutes | Compressed archive (`.tar.gz`) with rotation and off-host S3 / MinIO upload. |
| **Redis / BullMQ / Cache** | Ephemeral / Reconstructible | $\le 15$ minutes | $\le 5$ minutes | AOF/RDB persistence. Rebuildable job queues and cache rehydration from PostgreSQL. |

---

## 2. Backup Architecture & Off-Host Replication

Backups operate unattended through scheduled cron tasks and isolated verification scripts:

```mermaid
flowchart LR
    subgraph Host["Production VPS (OVH)"]
        PG[(PostgreSQL pgvector)] -->|pg_dump -Fc| Script["backup-postgres.sh"]
        Uploads["uploads/ Volume"] -->|tar -czf| ScriptUp["backup-uploads.sh"]
        Script -->|TOC Validation| LocalStorage["/srv/circlesfera/backups (30d Retention)"]
        ScriptUp --> LocalStorage
    end

    subgraph OffHost["Remote Off-Host Storage"]
        LocalStorage -->|AWS CLI / rclone S3| S3["AWS S3 / MinIO Glacier Bucket"]
    end

    subgraph Drill["Periodic Verification"]
        ScriptTest["verify-backup-restore.sh"] -->|Restore into Isolated DB| DBTest[(CircleSfera_restore_test)]
        DBTest -->|Assert _prisma_migrations & FKs| AuditReport["Structured JSON Audit Report"]
    end
```

### 2.1. Automated Scheduling (Cron)
- **Schedule:** Daily at **02:00 UTC** (`scripts/install-backup-cron.sh`).
- **Local Retention:** 30 days in `/srv/circlesfera/backups/postgres/full`.
- **Off-Host Destination:** `s3://${S3_BACKUP_BUCKET}/postgres/full/` and `s3://${S3_BACKUP_BUCKET}/uploads/`.
- **Staleness Threshold:** If a backup exceeds 26 hours of age without successful renewal, it is flagged as an RPO SLA violation.

---

## 3. Automated Restore Verification (Restore Drills)

A backup whose restoration has never been verified **is not a valid backup**.

### 3.1. Verification Tooling (`verify-backup-restore.sh`)
The `npm run db:verify-restore` command executes an end-to-end verification cycle in an isolated database:
1. Generates a fresh test dump or consumes an existing custom-format dump.
2. Asserts structural integrity via `pg_restore --list`.
3. Creates a clean ephemeral database (`CircleSfera_restore_test`).
4. Executes `pg_restore` against the ephemeral database.
5. Verifies that `_prisma_migrations` contains all applied migrations without rollback flags.
6. Asserts table existence and record counts for core entities (`User`, `Profile`, `Post`, `Wallet`).
7. Tears down the test database and emits structured JSON audit metrics.

### 3.2. Drill Cadence
- **Automated Verification:** Weekly in CI or scheduled host maintenance job.
- **Cold Recovery Simulation (Game Day):** Quarterly manual drill conducted by engineering.

---

## 4. Cold Disaster Recovery Runbook

Execute these steps in sequence in the event of total server loss, catastrophic disk failure, or datacenter outages.

### Step 1: Provision Clean Target Host
- Deploy a Linux host (Ubuntu 22.04 LTS or newer) with Docker and Docker Compose installed.
- Clone the official CircleSfera repository to `/srv/circlesfera`.
- Retrieve `.env.production` from the secure secrets vault (GitHub Secrets `ENV_PRODUCTION_B64` or Bitwarden).

### Step 2: Launch Data Tier Containers
Start only the data tier on the new host:
```bash
cd /srv/circlesfera
docker compose -f docker-compose.prod.yml up -d postgres redis minio
```
Confirm PostgreSQL is healthy:
```bash
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres
```

### Step 3: Fetch Latest Off-Host Backup
Download the latest verified dump from S3 storage:
```bash
mkdir -p /srv/circlesfera/backups/restore
aws s3 cp s3://${S3_BACKUP_BUCKET}/postgres/full/latest.dump \
  /srv/circlesfera/backups/restore/pg_latest.dump
```

### Step 4: Restore Database
Execute the canonical restore script requiring explicit confirmation:
```bash
CONFIRM=YES DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/CircleSfera" \
  ./scripts/restore-postgres.sh /srv/circlesfera/backups/restore/pg_latest.dump
```

### Step 5: Restore Media Volume
Download and unpack the media archive:
```bash
aws s3 cp s3://${S3_BACKUP_BUCKET}/uploads/latest.tar.gz \
  /srv/circlesfera/backups/restore/uploads_latest.tar.gz

tar -xzf /srv/circlesfera/backups/restore/uploads_latest.tar.gz -C /srv/circlesfera/
```

### Step 6: Verify Schema Migrations
Deploy any migrations that occurred after the snapshot timestamp:
```bash
cd /srv/circlesfera/circlesfera-backend
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/CircleSfera" \
  npx prisma migrate deploy
```

### Step 7: Launch Application Stack and Run Smoke Checks
Start the remaining containers (backend, frontend, Nginx reverse proxy):
```bash
cd /srv/circlesfera
docker compose -f docker-compose.prod.yml up -d
```
Verify health endpoints and identity contracts:
```bash
curl -f https://api.circlesfera.com/api/v1/health
npm run smoke:profile-drift
```

---

## 5. Emergency Incident Response Matrix

| Role | Responsibility | Primary Channel |
| :--- | :--- | :--- |
| **Incident Commander (IC)** | Disaster declaration, overall coordination, and traffic cutoff decisions. | P0 Escalation Channel / Phone |
| **Database Administrator (DBA) / Ops** | Execution of restore scripts, integrity assertions, and replication checks. | P0 War Room Slack |
| **Communications Lead** | Public status updates (`status.circlesfera.com`) and user stakeholder messaging. | P0 War Room Slack |
