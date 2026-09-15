# CircleSfera: Definitive Architecture

Este documento consolida la arquitectura técnica de CircleSfera, validada mecánicamente mediante comprobaciones de dependencias (`dependency-cruiser`) y Gates de Calidad. Representa el esquema final tras el cierre del Backlog de Refactorización.

## 1. Topología del Sistema
El sistema se implementa como un **Monolito Modular** estructurado en TypeScript. 
- **Browser:** React SPA + PWA. Todo el enrutamiento es mediante `react-router-dom`. Autenticación persistida en cookies HTTP-only, sin JWTs expuestos a JS.
- **Proxy (Nginx):** Terminación TLS, compresión y enrutamiento `/api/v1/` hacia el backend.
- **Backend (NestJS):** Maneja las APIs HTTP REST (Controllers) y WebSocket (Gateways).
- **Cola de Trabajos Asíncronos:** BullMQ procesando tareas pesadas (transcodificación de vídeo, correos, fan-out) en el mismo proceso monolítico para simplicidad operativa inicial, pero aislado lógicamente.
- **Bases de Datos:** PostgreSQL (con la extensión `pgvector` para cálculos de feed) mediante Prisma ORM. Redis sirve para Pub/Sub de Sockets, Caching global, Throttling (Limits) y colas BullMQ.

## 2. Límites y Restricciones Arquitectónicas (Backend)
- **Controladores Delgados:** Se limitan a aplicar los Guards, interceptores de Sentry/Throttling y parsear el Body/Query usando DTOs de `class-validator` (con `whitelist` y `forbidNonWhitelisted`).
- **Lógica de Servicios Directa a Prisma:** No existe capa de repositorio ni mappers. Los servicios consumen `PrismaService` directamente.
- **Inversión de Dependencias (Core vs Domain):** Las utilidades globales (`src/common/`) o librerías compartidas jamás pueden importar módulos de negocio como `src/auth`, `src/users`, o `src/posts`. Esto evita enredos cíclicos (verificado vía `dependency-cruiser`).
- **Seguridad Perimetral Exigente:** El monolito corre bajo políticas Helmet (Same-Site CORP, Strict CSP sin `unsafe-inline`), bloqueando `X-Powered-By`, aplicando doble validación CSRF (`csrf-csrf`) y requiriendo un escudo HSTS de proxy.

## 3. Arquitectura Frontend (Mobile-First)
- **Data Fetching:** Se utiliza un *Single API Client* que expone Axios e intercepta tokens CSRF. TanStack Query (`react-query`) maneja la caché del servidor (queries).
- **Gestión de Estado Reactiva:** 11 stores de `zustand` segmentados por dominio lógico (e.g. `authStore`, `socketStore`). Los Stores son estructuras de estado pasivas, la lógica e inicialización del negocio pertenece a la capa de Servicios (`src/services/*.ts`).
- **Barreras Visibles (UI Components):** El directorio `src/components/ui/` es estrictamente presentacional y agnóstico. No debe depender nunca de servicios (`src/services/`), páginas (`src/pages/`) o almacenes del contexto global (`src/stores/`).

## 4. Patrones Prohibidos Permanentemente (Sin un ADR explícito)
- **Microservicios** (División prematura del monolito).
- **Buses de Eventos de Dominio Locales** (e.g., usar `@nestjs/event-emitter` en lugar de llamadas directas entre servicios o paso a colas BullMQ).
- **GraphQL** o capas de GraphQL Gateway.
- **Tokens en Storage Local** del cliente.
- Rediseños o reescalados de interfaz que no prioricen la métrica base de **390x844px** (Densidad nativa móvil).
