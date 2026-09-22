# CircleSfera: Content Security Policy (CSP) & Realtime Origin Hardening Policy

> **Status:** Production / Implemented  
> **Order / Task:** Order 75 (SEC-014) — Gate A (Security)  
> **Dependencies:** `SEC-004`, `SEC-009`, `SEC-011`  
> **Source of Truth:** Codebase implementation (`origin.config.ts`, `redis-io.adapter.ts`, `app.gateway.ts`, `main.ts`) and automated test suites (`origin.config.spec.ts`, `app.gateway.spec.ts`, `realtime.security.e2e-spec.ts`).

---

## 1. Threat Model and Security Objectives

Web applications and WebSocket endpoints that rely on ambient browser credentials (HTTP-only cookies or Authorization headers) are vulnerable to cross-origin exploitation unless explicit origin isolation and Content Security Policies are enforced.

### 1.1 Cross-Site WebSocket Hijacking (CSWSH)
- **Vulnerability:** Standard Cross-Origin Resource Sharing (CORS) rules do not prevent WebSocket handshakes. If a WebSocket server configures `origin: true`, it dynamically echoes back any incoming `Origin` header from the client handshake while accepting ambient session cookies (`access_token`, `refresh_token`). An attacker running malicious JavaScript on `https://attacker.example.com` can trigger `new WebSocket('wss://api.circlesfera.com/socket.io/...')`, causing the victim's browser to send authenticated session cookies and grant the attacker full hijacked access to real-time chat, notifications, calls, and presence streams.
- **Remediation:** Strict server-side whitelist validation. Sockets must reject any connection originating from unapproved domains before processing authentication tokens or allocating room state.

### 1.2 Blanket Content Security Policy Wildcards
- **Vulnerability:** Specifying `connect-src 'self' wss://*` allows client-side scripts to initiate WebSocket connections to any arbitrary external server on the internet, creating data exfiltration channels for compromised dependencies or XSS payloads.
- **Remediation:** Eliminate wildcards. Bind `connect-src` strictly to explicit WebSocket endpoints (`ws://` and `wss://` derived from authorized application domains), verified third-party real-time media servers (LiveKit), and error telemetry ingest (Sentry).

### 1.3 Permissive Inline Script Execution
- **Vulnerability:** Globally allowing `'unsafe-inline'` in `script-src` renders Content Security Policy largely ineffective against stored or reflected Cross-Site Scripting (XSS).
- **Remediation:** Route segmentation. General JSON API routes (`/api/v1/*`) disallow `'unsafe-inline'` completely (`scriptSrc: ["'self'"]`). Documentation endpoints (`/api/docs`), which require inline rendering for Swagger UI bundle scripts and styles, receive a dedicated scoped policy.

---

## 2. Origin Configuration & Derivation Architecture

Origin validation is centralized in `src/common/config/origin.config.ts` to ensure consistency across HTTP CORS, WebSocket adapters, Gateway connection hooks, and Helmet CSP headers.

### 2.1 Allowed Origins Definition and Environment Parsing
- **Production Invariant:** If `NODE_ENV === 'production'` and `CORS_ORIGIN` is empty or undefined, the server throws an explicit configuration error at startup (`CORS_ORIGIN environment variable is required in production`).
- **Development Fallback:** In non-production environments, if `CORS_ORIGIN` is absent, the system defaults safely to local development hosts:
  - `http://localhost:5173` (Vite frontend dev server)
  - `http://localhost:3000` (Backend API dev server)
  - `http://127.0.0.1:5173`
  - `http://127.0.0.1:3000`

### 2.2 WebSocket Origin Derivation
The utility `deriveWebSocketOrigins(allowedOrigins)` automatically maps HTTP/HTTPS application origins into their corresponding WebSocket protocol schemes:
- `http://domain` $\rightarrow$ `ws://domain`
- `https://domain` $\rightarrow$ `wss://domain`
- Preserves port specifications, subdomains, and localhost development entries.
- Explicitly excludes any `*` or `wss://*` wildcards.

```typescript
// src/common/config/origin.config.ts
export function deriveWebSocketOrigins(allowedOrigins: string[]): string[] {
  const wsOrigins = new Set<string>();
  for (const origin of allowedOrigins) {
    if (origin.startsWith('https://')) {
      wsOrigins.add(origin.replace(/^https:\/\//, 'wss://'));
    } else if (origin.startsWith('http://')) {
      wsOrigins.add(origin.replace(/^http:\/\//, 'ws://'));
    }
  }
  return Array.from(wsOrigins);
}
```

---

## 3. Realtime Origin Enforcement & Defense-in-Depth

CircleSfera enforces origin validation at two distinct architectural layers:

### 3.1 Layer 1: RedisIoAdapter Level (Socket.IO Engine Handshake)
In `src/common/adapters/redis-io.adapter.ts`, `RedisIoAdapter.createIOServer` replaces unconstrained origins with dynamic origin validation:
1. Validates that incoming handshake requests originate from an allowed origin using `isOriginAllowed(origin, allowedOrigins)`.
2. Permits requests without an `Origin` header (such as mobile native apps, backend worker microservices, or curl diagnostic tooling).
3. If an origin is supplied but fails the whitelist check, Socket.IO aborts the connection handshake with an HTTP 403 Forbidden error.

### 3.2 Layer 2: AppGateway Gateway Guard (Defense-in-Depth)
In `src/socket/app.gateway.ts`, `AppGateway.handleConnection` validates the `client.handshake.headers.origin` prior to invoking `SocketAuthService.authenticate`:
1. If the origin header is present and does not match the configured whitelist, the gateway logs a security warning:
   `Cross-Site WebSocket Hijacking guard: dropped connection from unauthorized origin: <origin>`
2. Calls `client.disconnect(true)` immediately and aborts the connection pipeline.
3. User session lookup, room joining (`user:<profileId>`, `presence:<profileId>`), and Redis presence tracking are never executed for unauthorized origins.

---

## 4. Content Security Policy (CSP) Route Segmentation

Content Security Policy is applied in `src/main.ts` using Helmet middleware with route-based segmentation.

### 4.1 Strict API Policy (`/api/v1/*` and general endpoints)
Standard API responses apply zero `'unsafe-inline'` allowances:
- `defaultSrc: ["'self'"]`
- `scriptSrc: ["'self'"]`
- `styleSrc: ["'self'"]`
- `imgSrc: ["'self'", "data:", "https:"]`
- `fontSrc: ["'self'"]`
- `objectSrc: ["'none'"]`
- `frameAncestors: ["'none'"]` (mitigates clickjacking across all API endpoints)
- `connectSrc: ["'self'", ...derivedWsOrigins, livekitWs, sentryIngest]`
- `upgradeInsecureRequests: []` (enabled only in production; disabled in development to prevent localhost HTTP breakage).

### 4.2 Documentation Policy (`/api/docs`)
NestJS OpenAPI/Swagger UI serves client-side assets that inject inline scripts and styles:
- Conditionally applied when `req.path.startsWith('/api/docs')`.
- Grants scoped `'unsafe-inline'` to `scriptSrc` and `styleSrc`.
- Retains `'none'` for `objectSrc` and strict `connectSrc` bounds.

---

## 5. Verification Matrix and Security Tests

| Test Target | Test Suite | Description |
|---|---|---|
| **Origin Whitelisting** | `origin.config.spec.ts` | Validates default dev origins, production mandatory `CORS_ORIGIN`, and parsing of comma-separated origins. |
| **WS Derivation** | `origin.config.spec.ts` | Confirms HTTP $\rightarrow$ WS and HTTPS $\rightarrow$ WSS conversion without wildcards. |
| **CSWSH Detection** | `origin.config.spec.ts` | Tests `isOriginAllowed` against malformed, attacker, and sub-domain collision URLs. |
| **CSP Route Directives** | `origin.config.spec.ts` | Asserts strict mode excludes `'unsafe-inline'` and Swagger mode includes scoped inline allowance. |
| **Gateway CSWSH Guard** | `app.gateway.spec.ts` | Disconnects client immediately with `disconnect(true)` and prevents authentication when unauthorized origin attempts connection. |
| **Whitelisted Gateway Handshake** | `app.gateway.spec.ts` | Verifies legitimate origin completes handshake and joins user rooms. |
| **Realtime Security E2E** | `realtime.security.e2e-spec.ts` | Full NestJS integration test verifying socket disconnection upon unauthorized origin and successful connection upon whitelisted origin. |
