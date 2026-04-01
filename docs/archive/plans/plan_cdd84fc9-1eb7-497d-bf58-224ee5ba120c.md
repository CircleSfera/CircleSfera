# Implementation Plan: Fix circlesfera.com Connection Issue

The user reports that `circlesfera.com` is not loading. Investigation shows that the production server (54.37.159.171) is unreachable (timeout), and the `docker-compose.prod.yml` has incorrect paths for the Nginx configuration volumes.

## Proposed Changes

### [Docker Configuration]

Summary: Fix incorrect volume paths in `docker-compose.prod.yml` to ensure the Nginx proxy container can find its configuration files.

#### [MODIFY] [docker-compose.prod.yml](file:///Users/ShadyFeliu/Desktop/Projects/CircleSfera/docker-compose.prod.yml)

- Update Nginx volume paths from `./master.conf` to `./nginx/master.conf`.
- Update Nginx volume paths from `./.htpasswd` to `./nginx/.htpasswd`.

> [!IMPORTANT]
> The current port mapping is `8082:80`. If `circlesfera.com` is accessed without a port, it defaults to port 80. Ensure there is a host-level Nginx proxying traffic from port 80/443 to 8082, or change the mapping to `80:80`.

## Verification Plan

### Manual Verification
1. **Apply fixes**: Apply the path fixes in `docker-compose.prod.yml`.
2. **Deploy**: Push changes to the repository or deploy manually.
3. **Check VPS connectivity**:
   - Verify if the VPS is reachable: `ping 54.37.159.171`.
   - Verify if port 80 is open: `curl -I http://circlesfera.com`.
   - If using port 8082: `curl -I http://circlesfera.com:8082`.
4. **Check Docker Status on VPS**:
   - `ssh shadyfeliu@54.37.159.171 "docker ps"` to see if `CircleSfera-Proxy` is running.
   - `ssh shadyfeliu@54.37.159.171 "docker logs CircleSfera-Proxy"` to check for configuration errors.
