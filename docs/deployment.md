# Deployment Protocol: CircleSfera

## 1. Connection Details
- **User**: `shadyfeliu`
- **Host**: `54.37.159.171`
- **Path**: `/srv/circlesfera`
- **Command**: `ssh shadyfeliu@54.37.159.171`

## 2. Multi-Repo Workflow
CircleSfera uses multiple repositories. Ensure children are pushed **before** deploying.

1.  Push changes in `./circlesfera-backend`
2.  Push changes in `./circlesfera-frontend`
3.  Push changes in `./circlesfera-landing`

## 3. Production Deployment (VPS)
Run the following commands on the VPS:

```bash
cd /srv/circlesfera
# Pull child repos
git -C circlesfera-backend pull origin main
git -C circlesfera-frontend pull origin main

# Clean & Rebuild
docker compose -f docker-compose.prod.yml down
docker system prune -af  # Cleans images, keeps volumes
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

## 4. Maintenance Commands
- **View Backend Logs**: `docker logs CircleSfera-Backend --tail 100 -f`
- **Check DB Health**: `docker logs CircleSfera-Postgres --tail 50`
- **Check Network Connectivity**: `docker network inspect circlesfera-network`
- **DB Migrations**: Handled automatically on backend start via `npx prisma migrate deploy`.

## 5. Advanced Troubleshooting

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

### Mount Errors (Nginx Proxy)
If a config file (like `master.conf`) is replaced by a folder by Docker (due to missing source):
`docker run --rm -v /srv/circlesfera:/mnt busybox rm -rf /mnt/nginx`
Then recreate the `nginx/` folder accurately and place the files before restarting.

## 6. Rollback Procedure

If the new deployment is broken and needs to be reverted immediately:
1.  Stop the broken services: `docker compose -f docker-compose.prod.yml down`
2.  Revert the sub-repositories to the previous stable commit:
    - `cd circlesfera-backend && git reset --hard HEAD@{1}`
    - `cd circlesfera-frontend && git reset --hard HEAD@{1}`
3.  Rebuild and start:
    `docker compose -f docker-compose.prod.yml up -d --build`
