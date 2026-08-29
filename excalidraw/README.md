# CircleSfera — arquitectura visual (Excalidraw)

Diagramas C4 y de dominio del sistema **tal como está construido**. No describen un target futuro.

## Cómo abrirlos (Cursor muestra JSON)

Cursor suele abrir `.excalidraw` como texto. El canvas visual de la extensión `pomdtr.excalidraw-editor` es web-only y a menudo no se registra.

**Ver ahora (recomendado):**

1. Abre [`index.html`](./index.html) en el navegador (doble clic o `open excalidraw/index.html`).
2. O abre un preview SVG en Cursor: [`preview/00-index.svg`](./preview/00-index.svg).

**Editar el original:**

- Arrastra el `.excalidraw` a [excalidraw.com](https://excalidraw.com).
- En Cursor: clic derecho → **Open With… → Excalidraw**. Si no aparece, Command Palette → `Excalidraw: Open Excalidraw`.
- Regenerar previews: `python3 excalidraw/export-svg.py`

**Fecha de verificación:** 2026-08-29  
**Fuentes canónicas:** `schema.prisma`, `app.module.ts`, controladores, `docker-compose*.yml`, `nginx/master.conf.template`, ADRs 0001–0015, `00-status.md`.

Presente = shipped. Lo diferido está solo en `20-out-of-scope.excalidraw` y en [00-status.md](../circlesfera-documentation/00-status.md).

---

## Cómo leer este set (principio → final)

| # | Archivo | Nivel | Qué responde |
| --- | --- | --- | --- |
| 00 | [00-index.excalidraw](./00-index.excalidraw) | Mapa | Índice visual de todo el set |
| 01 | [01-c4-context.excalidraw](./01-c4-context.excalidraw) | C4-1 | Quién usa qué, sistemas externos |
| 02 | [02-c4-containers.excalidraw](./02-c4-containers.excalidraw) | C4-2 | SPA, nginx, API, Postgres, Redis |
| 03 | [03-c4-deployment-prod.excalidraw](./03-c4-deployment-prod.excalidraw) | C4-4 | Producción OVH VPS (hoy) |
| 04 | [04-c4-deployment-dev.excalidraw](./04-c4-deployment-dev.excalidraw) | C4-4 | Compose local |
| 05 | [05-monorepo.excalidraw](./05-monorepo.excalidraw) | Estructura | Paquetes del repo |
| 06 | [06-backend-layers.excalidraw](./06-backend-layers.excalidraw) | C4-3 | Controller → Service → Prisma |
| 07 | [07-backend-modules.excalidraw](./07-backend-modules.excalidraw) | C4-3 | Módulos NestJS por dominio |
| 08 | [08-frontend-architecture.excalidraw](./08-frontend-architecture.excalidraw) | C4-3 | SPA: Query, Zustand, ApiClient |
| 09 | [09-frontend-surfaces.excalidraw](./09-frontend-surfaces.excalidraw) | Producto | Rutas y hosts |
| 10 | [10-identity-user-profile.excalidraw](./10-identity-user-profile.excalidraw) | Dominio | User / Profile / AdminIdentity |
| 11 | [11-data-model-domains.excalidraw](./11-data-model-domains.excalidraw) | Datos | Clusters de `schema.prisma` |
| 12 | [12-auth-security.excalidraw](./12-auth-security.excalidraw) | Seguridad | Cookies, CSRF, guards |
| 13 | [13-request-lifecycle.excalidraw](./13-request-lifecycle.excalidraw) | Dinámico | Un request de punta a punta |
| 14 | [14-async-realtime.excalidraw](./14-async-realtime.excalidraw) | Async | BullMQ, Socket.IO, cron |
| 15 | [15-feed-hybrid.excalidraw](./15-feed-hybrid.excalidraw) | Flujo | Fan-out híbrido (ADR-0009) |
| 16 | [16-monetization.excalidraw](./16-monetization.excalidraw) | Dinero | Stripe, fee 20%, Connect |
| 17 | [17-admin-trust.excalidraw](./17-admin-trust.excalidraw) | T&S | Admin Panel + reportes |
| 18 | [18-live-webrtc.excalidraw](./18-live-webrtc.excalidraw) | Media | LiveKit + llamadas P2P |
| 19 | [19-ci-cd.excalidraw](./19-ci-cd.excalidraw) | Ops | PR → GHCR → OVH |
| 20 | [20-out-of-scope.excalidraw](./20-out-of-scope.excalidraw) | Límites | Explicitamente no shipped |

---

## Forma del sistema (hechos verificados)

Monolito modular NestJS 11 + SPA React 19. **No hay microservicios.**

```text
Browser (React SPA / PWA)
   │  HTTPS, cookies httpOnly + header x-csrf-token
   ▼
nginx  (TLS en el host en prod; proxy compose en dev)
   ├── static frontend
   └── /api/v1/*  y  /api/v1/socket.io/*
        ▼
   NestJS  ──►  PostgreSQL + pgvector
           ──►  Redis (cache, BullMQ, Socket.IO pub/sub)
           ──►  Stripe, LiveKit, OpenAI, Brevo, S3/Cloudinary
           └──  processors BullMQ in-process + @Cron
```

- Prefijo global: `api/v1`. Swagger: `/api/docs`.
- Auth de usuario: cookies `access_token` (15 min) + `refresh_token` (7 d). Admin: `admin_access_token` (10 min) + `admin_refresh_token` (8 h) en `admin.circlesfera.com`.
- Identidad: `User` = cuenta; `Profile` = identidad social (`username`); `AdminIdentity` = operador. JWT de usuario lleva `userId` (`sub`) y `profileId`. Creador no es otra identidad: `User.accountType` es `PERSONAL | CREATOR | BUSINESS` y es reversible (settings + `syncUserTier`).
- Schema canónico: **76 modelos**, 28 enums en `circlesfera-backend/prisma/schema.prisma` (las cifras 65/27 de `.ai/` están desfasadas).
- Landing estática `circlesfera-landing/` **eliminada** (Jul 2026). No restaurar.

---

## Drift documentado (código gana)

| Afirmación en `.ai/` / rules | Realidad verificada 2026-08-29 |
| --- | --- |
| “No hay EventEmitter2 / event bus” | `@nestjs/event-emitter` está en `app.module.ts` y se usa in-process (`notification.create`, `media.delete_batch`, `payment.live_gift_completed`). No es un bus de dominio entre servicios. |
| “No hay OwnershipGuard genérico” | `OwnershipGuard` existe y se usa en `posts.controller.ts`. La mayoría de ownership sigue en servicios. |
| “10 colas BullMQ” | Hay al menos **11** nombres: las 10 listadas en architecture.md **más** `posts-processing`. |
| “65 modelos / 10 ADRs” | Schema: **76** modelos. ADRs: **0015**. |
| “backend host :3005” | `docker-compose.yml` publica `3000:3000`. Dev proxy: `:8080`. Prod proxy: `nginx-proxy` `:8082`. |

---

## Convención visual

| Color | Significado |
| --- | --- |
| Azul | Persona / actor |
| Índigo | Sistema CircleSfera |
| Teal | Contenedor desplegable (SPA, API, nginx) |
| Verde | Persistencia (Postgres, volúmenes) |
| Naranja | Cola / async |
| Gris | Sistema externo |
| Ámbar | Auth / seguridad |
| Rosa | Dinero / Stripe |
| Púrpura | Admin / Trust & Safety |
| Gris claro + dashed | Fuera de scope / diferido |

Nombres técnicos (módulos, paths, modelos) en inglés, como en el código. Títulos en español.

---

## Qué no es este set

- No sustituye a `schema.prisma` ni a los controladores.
- No inventa endpoints, modelos ni flujos.
- El target Cloudflare/ECS de `05-deployment-strategy.md` **no está desplegado**; no aparece como producción.
