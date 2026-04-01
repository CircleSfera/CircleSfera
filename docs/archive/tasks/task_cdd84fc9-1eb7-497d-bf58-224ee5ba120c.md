# Debugging 502 Bad Gateway

 - [x] Identify error source (Host Nginx vs Docker Nginx)
 - [/] Phase 1: Docker Status Verification
     - [ ] Check if containers are running: `docker ps`
     - [ ] Check `CircleSfera-Proxy` logs: `docker logs CircleSfera-Proxy`
 - [/] Phase 2: Host Nginx Configuration Check
     - [ ] Identify host Nginx config file (usually in `/etc/nginx/sites-enabled/`)
     - [ ] Verify the `proxy_pass` port (should match `docker-compose.prod.yml`'s host port)
 - [ ] Phase 3: Connectivity Test
     - [ ] Test local access to the mapping port: `curl -I http://localhost:8082`
