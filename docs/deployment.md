# Deployment Protocol: CircleSfera (rsync)

This document outlines the authoritative process for deploying CircleSfera to production. We use a **local-build-and-sync** strategy to ensure consistent artifacts and minimize remote build overhead.

## 1. Host Details
- **User**: `shadyfeliu`
- **Host**: `54.37.159.171` (OVH VPS)
- **Repo Path**: `/srv/circlesfera`
- **SSH Command**: `ssh shadyfeliu@54.37.159.171`

## 2. Production Deployment Procedure

Follow these steps from your **local machine** in the root directory:

### Step A: Local Build
Build the static assets for the Frontend and Landing pages to ensure they are ready for Nginx.
```bash
# Build Frontend
cd circlesfera-frontend && npm run build && cd ..
# Build Landing
cd circlesfera-landing && npm run build && cd ..
```

### Step B: Synchronize to VPS (rsync)
Push the entire project root to the VPS, excluding development noise.
```bash
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --include '.env.production' \
  . shadyfeliu@54.37.159.171:/srv/circlesfera
```

### Step C: Remote Orchestration (SSH)
Connect to the VPS and trigger a fresh Docker build and restart.
```bash
ssh shadyfeliu@54.37.159.171 "cd /srv/circlesfera && \
  docker compose -f docker-compose.prod.yml down && \
  docker system prune -af && \
  docker compose -f docker-compose.prod.yml up -d --build"
```

## 3. Maintenance & Verification
- **Check Backend Logs**: `docker logs CircleSfera-Backend --tail 100 -f`
- **DB Migrations**: Handled automatically on backend start. To run manually:
  `docker exec -it CircleSfera-Backend npx prisma migrate deploy`
- **Prune Volumes** (Caution): If you need to clear the DB: `docker volume rm circlesfera_postgres_data`

## 4. Troubleshooting

### Permission Denied (rsync)
If `rsync` fails on the `uploads/` directory, it's normal (Docker-owned). Use `--exclude 'circlesfera-backend/uploads'` if necessary, although the current protocol handles partial transfers gracefully.

### Build Failures
If `nest build` fails remotely due to "Unused @ts-expect-error", ensure your local code is cleaned of these directives before syncing, as the production container generates fresh Prisma types.
