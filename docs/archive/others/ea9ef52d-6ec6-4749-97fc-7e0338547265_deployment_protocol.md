# CircleSfera Deployment Protocol (DevOps)

This document serves as the ground truth for all DevOps and deployment operations for the CircleSfera project. Following this protocol prevents common errors related to the multi-repository structure and Docker volume mounts.

## 1. Project Architecture & Repositories

CircleSfera is **not** a monolithic repository. It is a collection of independent repositories organized within a root orchestration directory.

| Repository | Primary Use | Local Path |
| :--- | :--- | :--- |
| `circlesfera-backend` | NestJS API & Prisma | `./circlesfera-backend` |
| `circlesfera-frontend` | React/Vite/Tailwind UI | `./circlesfera-frontend` |
| `circlesfera-landing` | Static Landing Site | `./circlesfera-landing` |
| `circlesfera-shared` | Shared Types/Logic | `./circlesfera-shared` |
| **(Orchestration Root)** | Docker Compose & Nginx | `./` |

> [!IMPORTANT]
> **Always** run `git status` or `git remote -v` in each subdirectory before pushing. The root directory is **not** always tracked as a single Git repository on GitHub.

## 2. Infrastructure & Connectivity

*   **Production VPS IP**: `54.37.159.171`
*   **Deployment User**: `shadyfeliu`
*   **Absolute Path on VPS**: `/srv/circlesfera`
*   **Standard SSH Command**: `ssh shadyfeliu@54.37.159.171`

## 3. Standard Deployment Procedure

To deploy changes, follow these steps in order:

### Phase A: Local Prep
1.  Commit and push changes to the relevant sub-repositories (`backend`, `frontend`, etc.).
2.  If `docker-compose.prod.yml` or `nginx/` configs changed, sync them to the VPS using `scp`.

### Phase B: VPS Sync & Rebuild
1.  Connect to the VPS.
2.  `cd /srv/circlesfera`
3.  `git -C circlesfera-backend pull origin main`
4.  `git -C circlesfera-frontend pull origin main`
5.  **Clean State**: `docker compose -f docker-compose.prod.yml down`
6.  **Disk Space**: `docker system prune -af` (Safe for database volumes)
7.  **Rebuild**: `docker compose -f docker-compose.prod.yml build --no-cache`
8.  **Deploy**: `docker compose -f docker-compose.prod.yml up -d`

## 4. Critical Pre-flight Checks (Anti-Error)

> [!WARNING]
> **Docker Volume Mounts**: 
> If `docker-compose.prod.yml` references a file mount (e.g., `./nginx/master.conf`), the folder `nginx/` **must** exist on the host and contain the file **before** running `docker compose up`. 
> 
> **Failure to do this results in Docker creating a root-owned directory instead of a file mount**, which will crash the Nginx proxy and require `sudo` or specialized Docker commands to fix.

### Manual Fix for Corrupted Mounts
If you encounter "Permission Denied" or "Mount source is a directory" errors:
```bash
docker run --rm -v /srv/circlesfera:/mnt busybox rm -rf /mnt/nginx
mkdir -p nginx && mv master.conf nginx/
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

## 5. Maintenance Commands
- **View Backend Logs**: `docker logs CircleSfera-Backend --tail 100 -f`
- **Check DB Health**: `docker logs CircleSfera-Postgres --tail 50`
- **Check Network Connectivity**: `docker network inspect circlesfera-network`
- **DB Migrations**: Handled automatically on backend start via `npx prisma migrate deploy`.

## 6. Advanced Troubleshooting

### Prisma Migration Failures
If the backend fails to start due to "Prisma migration timed out" or "Schema mismatch":
1.  Check if the database is actually ready: `docker logs CircleSfera-Postgres`.
2.  Force a manual migration from the container (if build succeeded):
    `docker exec -it CircleSfera-Backend npx prisma migrate deploy`
3.  If truly stuck, you may need to reset (Warning: Data loss!):
    `docker exec -it CircleSfera-Backend npx prisma migrate reset`

### Container Crash Loop
If a container restarts continuously:
1.  Check exit code: `docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.ExitCode}}"`
2.  Inspect for specific errors: `docker inspect <container_name>`

## 7. Rollback Procedure

If the new deployment is broken and needs to be reverted immediately:
1.  Stop the broken services: `docker compose -f docker-compose.prod.yml down`
2.  Revert the sub-repositories to the previous stable commit:
    - `cd circlesfera-backend && git reset --hard HEAD@{1}`
    - `cd circlesfera-frontend && git reset --hard HEAD@{1}`
3.  Rebuild and start:
    `docker compose -f docker-compose.prod.yml up -d --build`
