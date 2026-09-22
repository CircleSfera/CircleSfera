# CircleSfera: Nginx Traffic and Buffering Policy

This document defines the production traffic rules, timeout boundaries, and proxy buffering policies implemented in `nginx/master.conf.template`.

---

## 1. Context and Problem Statement

Configuring broad, server-level timeouts (such as `proxy_read_timeout 300s`) and turning off proxy buffering globally (`proxy_buffering off`) introduces severe reliability risks in high-traffic applications:

1. **Slowloris & Connection Exhaustion:** When small REST API endpoints permit 300-second read timeouts, hanging queries or slow client transmissions tie up Nginx worker connections and Node.js event loop capacity indefinitely.
2. **Backend Concurrency Starvation:** Disabling `proxy_buffering` globally forces Node.js to stream response bytes directly to slow mobile clients. Instead of Nginx quickly absorbing the JSON response into memory buffers and releasing Node.js, the backend worker process remains pinned for the duration of client network latency.
3. **Unchecked Request Payloads:** Allowing 100MB request payloads across all routes exposes lightweight endpoints (such as authentication or status probes) to memory abuse.

To ensure production reliability, CircleSfera enforces **conservative bounded defaults** across standard routes, with **strictly scoped exceptions** isolated to endpoints that legitimately require streaming or large payloads.

---

## 2. Traffic Policy Matrix

| Route Class | Scope / Location | Body Limit | Read Timeout | Connect Timeout | Proxy Buffering | Request Buffering | Rationale |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Standard REST API** | `/api/v1/` and root `/` | `10m` | `60s` | `10s` | **`on`** | **`on`** | Fast JSON response buffering frees Node.js workers immediately; prevents slowloris. |
| **Media & File Uploads** | `/api/v1/uploads` | `100m` | `300s` | `15s` | **`on`** | **`off`** | Direct streaming to backend without spooling 100MB files to Nginx disk first. |
| **Realtime WebSockets** | `/socket.io/`<br>`/api/v1/socket.io/` | `10m` | `3600s` | `10s` | **`off`** | N/A | Persistent duplex socket keepalive; unbuffered low-latency packet transmission. |
| **GDPR Data Exports** | `.../gdpr/exports/*/download` | `10m` | `300s` | `10s` | **`off`** | N/A | Direct chunked streaming of large `.zip` archives without proxy memory pressure. |
| **Internal Auth Probe** | `/internal/media-auth` | `0` | `10s` | `5s` | **`on`** | N/A | Ultra-fast subrequest authorization for protected media delivery. |

---

## 3. Detailed Architecture and Directive Reference

### 3.1. Conservative Bounded Defaults (Server-Level)

Applied across all production virtual hosts (`circlesfera.com`, `api.circlesfera.com`, `dev.circlesfera.com`, `localhost`, `admin.circlesfera.com`):

```nginx
# Bounded client payload and request buffer defaults
client_max_body_size 10m;
client_body_buffer_size 128k;

# Bounded default timeouts
client_body_timeout 30s;
send_timeout 30s;
proxy_connect_timeout 10s;
proxy_send_timeout 30s;
proxy_read_timeout 60s;

# Standard response buffering (releases backend processes immediately)
proxy_buffering on;
proxy_buffers 8 16k;
proxy_buffer_size 16k;
proxy_busy_buffers_size 32k;
proxy_request_buffering on;
```

### 3.2. Scoped Media Upload Exception

Configured on `/api/v1/uploads` to handle video and image uploads up to 100MB:

```nginx
location /api/v1/uploads {
    proxy_pass $backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # High-volume upload exceptions
    client_max_body_size 100m;
    client_body_buffer_size 16M;
    client_body_timeout 300s;
    proxy_connect_timeout 15s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    proxy_request_buffering off;
}
```

- `proxy_request_buffering off;` streams uploaded bytes directly to the backend Multer pipeline, avoiding intermediate disk I/O on the Nginx container.

### 3.3. Scoped Realtime WebSockets Exception

Configured on `/socket.io/` and `/api/v1/socket.io/` for Socket.io duplex communication:

```nginx
location /socket.io/ {
    proxy_pass $backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Realtime streaming exceptions
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

- `proxy_buffering off;` ensures packets are dispatched to clients with sub-millisecond latency.
- `proxy_read_timeout 3600s;` permits persistent connection lifetime without spurious proxy disconnects.

### 3.4. Scoped Large Archive Streaming Exception

Configured on GDPR data export downloads:

```nginx
location ~ ^/api/v1/users/gdpr/exports/[^/]+/download$ {
    proxy_pass $backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Streaming export exceptions
    proxy_buffering off;
    proxy_read_timeout 300s;
    send_timeout 300s;
}
```

---

## 4. Automated Verification Tooling

CircleSfera provides automated static validation for Nginx configurations via `scripts/test-nginx-config.mjs`:

```bash
# Run local Nginx traffic policy linter
npm run nginx:lint
```

The linter validates:
1. Balanced block syntax and bracket nesting.
2. Absence of un-scoped 300s timeouts in server blocks.
3. Absence of global un-scoped `proxy_buffering off`.
4. Presence of dedicated `/api/v1/uploads` exception with 100M limit and unbuffered request streaming.
5. Presence of dedicated WebSockets exception with unbuffered delivery and keepalive $\ge 3600$s.
6. Presence of dedicated GDPR archive download streaming exception.
7. Verification that default REST routes enforce a bounded read timeout ($\le 60$s).

The check is integrated directly into the CI Quality pipeline (`ci-quality.yml`).
