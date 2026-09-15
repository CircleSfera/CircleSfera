# CircleSfera: Implementation Status

> **Source of Truth:** Este documento refleja el estado real de implementación del código en el repositorio. Si existe código que no se menciona aquí, este documento debe actualizarse. Si un agente de IA intenta interactuar con un módulo que figura como *Out of Scope* o que no existe, debe detenerse y pedir confirmación.

## 🟢 Shipped (Producción / Completado)
Los siguientes módulos están implementados, testeados (QA), asegurados (Security) y su arquitectura está delimitada mecánicamente (Gates cerrados).

### Backend
- **Core Architecture:** Monolito modular con NestJS, Prisma (PostgreSQL), y BullMQ.
- **Seguridad (Gate A):** Configuración estricta de Helmet (HSTS, CSP, CORP), CSRF de doble envío, `express-rate-limit`, `turnstile` contra bots, y validación severa de DTOs (`forbidNonWhitelisted: true`). 
- **Autenticación:** Sistema JWT con cookies `httpOnly`, soporte para 2FA y Passkeys (WebAuthn).
- **Gestión de Identidad:** División de `User` (credenciales y facturación) vs. `Profile` (entidad social e interacción), según el ADR-0015.
- **Tiempo Real:** Socket.io implementado y escalado con Redis Adapter, con namespace de `events` asegurado por tokens.
- **Pagos (Stripe):** Suscripciones, webhooks seguros e integración en backend sin que el frontend envíe precios (ADR-0010).

### Frontend
- **Arquitectura:** React SPA con Vite, enrutamiento lazy (`BrowserRouter`), y gestores de estado segmentados (TanStack Query para estado de servidor y 11 `zustand` stores para cliente).
- **Consumo de API:** Un único cliente HTTP (`ApiClient`) con interceptores para rotación automática de JWT y validación CSRF.
- **Acoplamiento (Gate C):** Stores de Zustand (como `socketStore`) no poseen el ciclo de vida, simplemente exponen el estado reactivo proveniente de sus respectivos servicios (`realtime.service.ts`).
- **Diseño (Mobile-first):** Resoluciones priorizadas de 390x844px, con soporte escalado sin desproporcionar componentes, uso denso de UI (inspirado en Meta/Threads).

### Infraestructura
- **Nginx (Proxy Maestro):** Entornos de Producción (`circlesfera.com`, `api.*`, `admin.*`) con HSTS. Entorno de Desarrollo (`dev.*`) asegurado detrás de Auth Basic con las exclusiones estrictas de Stripe y verificadores de estado.
- **Docker Compose:** Orquestación completa de frontend, backend, PostgreSQL (pgvector), y Redis.

## 🟡 In Development (Refactorización / Transición)
- **Documentación Técnica:** Creación de los esquemas definitivos y abandono de los bocetos de la carpeta `.ai/`.

## 🔴 Out of Scope (No implementado)
- Microservicios separados (se prohíbe explícitamente dividir el monolito sin un ADR).
- Bus de eventos de dominio (`EventEmitter2`, CQRS, Event Sourcing). No intentes introducirlo.
- GraphQL. Toda la API está basada en REST con controladores ligeros.
- Almacenamiento de JWT o tokens sensibles en `localStorage` (estrictamente por cookies HTTP-only).
