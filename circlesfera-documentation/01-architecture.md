# CircleSfera: Definitive Architecture

This document consolidates the official technical architecture of CircleSfera, validated through mechanical dependency rules (`dependency-cruiser`) and quality gates. It reflects the production baseline of the codebase.

---

## 1. System Topology
The system is built as a **Modular Monolith** implemented in TypeScript:
- **Browser:** React SPA + PWA. Client-side routing is handled via `react-router-dom`. Authentication sessions persist in secure `httpOnly` cookies; no JWTs or refresh tokens are exposed to JavaScript execution.
- **Proxy (Nginx):** Edge TLS termination, HTTP compression, static caching, and reverse-proxying `/api/v1/` to the backend.
- **Backend (NestJS):** Modular HTTP REST API (`Controllers`) and real-time WebSockets (`Gateways`).
- **Asynchronous Job Queues:** BullMQ processing background and compute-intensive tasks (video transcoding, notification delivery, fan-out, email dispatch) in logically isolated workers.
- **Data Tier:** PostgreSQL (equipped with the `pgvector` extension for semantic search and feed embeddings) managed through Prisma ORM. Redis powers Socket.io distributed adapters, application caching, request rate-limiting, and BullMQ queues.

---

## 2. Architectural Boundaries & Backend Constraints
- **Lean Controllers:** Controllers are strictly limited to binding HTTP routes, applying authentication guards, executing throttling/observability interceptors, and validating payloads via `class-validator` DTOs (`whitelist: true`, `forbidNonWhitelisted: true`).
- **Direct Prisma Access from Domain Services:** The codebase avoids redundant repository or mapping layers. Domain services interact directly with `PrismaService` for database transactions and queries.
- **Dependency Hierarchy (Core vs. Domain):** Foundational utilities (`src/common/`) and shared modules must never import domain business modules (`src/auth`, `src/users`, `src/posts`). This boundary is enforced in CI via `dependency-cruiser` to prevent circular dependencies.
- **Perimeter Security:** The application enforces strict Helmet HTTP headers (Same-Site CORP, CSP without `unsafe-inline`), removes `X-Powered-By`, requires double-submit CSRF tokens (`csrf-csrf`) for state-mutating requests, and mandates HSTS upstream.

---

## 3. Frontend Architecture (Mobile-First)
- **Data Fetching:** Handled through a centralized API client (`ApiClient`) configured with Axios, automating JWT rotation on `401 Unauthorized` and attaching CSRF tokens to mutating requests. TanStack Query (`react-query`) manages server state and caching.
- **Reactive State Management:** Client-side state is segregated into 11 domain-specific `zustand` stores (e.g., `authStore`, `socketStore`). Stores serve as reactive state representations; connection lifecycles and business workflows reside in domain services (`src/services/*.ts`).
- **Presentational Component Boundary:** Primitives under `src/components/ui/` are strictly presentational and context-agnostic. They must not depend directly on application services (`src/services/`), route pages (`src/pages/`), or global domain stores (`src/stores/`).

---

## 4. Permanently Forbidden Patterns (Without an Approved ADR)
- **Microservices Architecture:** Premature decomposition of the monolith is prohibited.
- **Local Domain Event Buses:** Do not use `EventEmitter2` to replace direct service calls or BullMQ jobs for state transitions or durable work, and CQRS event sourcing remains fully forbidden. `EventEmitter2` is accepted only for the closed list of realtime/notification/cleanup side effects defined in [ADR-0019](adr/0019-bounded-domain-event-bus.md).
- **GraphQL:** The application API is strictly RESTful.
- **Tokens in Local Storage:** Sensitive authentication tokens must never be persisted in browser `localStorage` or `sessionStorage`.
- **Desktop-Only or Distorted Layouts:** UI components must be designed and verified first at **390×844px** (native iPhone density) before adding parallel columns for desktop viewports.
