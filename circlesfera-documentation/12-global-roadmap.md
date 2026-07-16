# Master Plan y Roadmap Global: Estrategia, Producto y Escalabilidad

CircleSfera ya cuenta con un core social sólido (feed, perfiles, posts, frames, stories, chat, integraciones de pago). Este documento funciona como el **Master Plan** del proyecto: un blueprint de nivel corporativo que detalla la estrategia multiplataforma, las tácticas de lanzamiento, la operativa legal/financiera y la evolución técnica bajo el marco temporal **Now / Next / Later**.

*(Para los detalles comerciales específicos, referirse a la Estrategia de Monetización en `10-roadmap-monetization.md`)*.

---

## 1. Estrategia Multiplataforma y Expansión Global

### 1.1 Soporte Multiplataforma
*   **Fase Inicial (Web-First / PWA):** Lanzamiento como Aplicación Web Progresiva (PWA) responsiva, iterando rápido sin bloqueos de las App Stores.
*   **Fase Nativa (App Stores):** Transición a aplicaciones móviles nativas (React Native / Swift / Kotlin) para capitalizar Notificaciones Push Nativas y APIs biométricas (Passkeys integrados en SO).

### 1.2 Internacionalización (i18n)
*   **Soporte Multi-Idioma y Monedas:** Arquitectura frontend dinámica; cobros localizados (soportado nativamente vía Stripe).
*   **Distribución Global (CDN):** Enrutamiento Edge para baja latencia multimedia a nivel global.

---

## 2. Go-To-Market (GTM) y Crecimiento Orgánico (Growth)

### 2.1 Lanzamiento Escalonado
*   **Alpha Privada (Invite-Only):** Acceso restringido para creadores semilla. Foco en descubrir bugs y generar FOMO.
*   **Beta Pública (Referrals):** Apertura controlada mediante un programa de referidos (ej. 3 invitaciones por usuario).
*   **General Availability (GA):** Apertura total y soporte de marketing masivo.

### 2.2 Estrategia SEO y Viralidad
*   **Perfiles Indexables (SSR):** Renderizado del lado del servidor para que Google indexe los perfiles de los creadores y sus posts públicos.
*   **Dynamic Open Graph (OG):** Generación automática de imágenes previas (thumbnails con título y avatar) cuando se comparte un link de CircleSfera en Twitter, WhatsApp o iMessage.

---

## 3. Privacidad, Seguridad (InfoSec) y Cumplimiento Legal

### 3.1 Cumplimiento Normativo (GDPR / CCPA)
*   **Data Export (Portabilidad):** Herramienta automatizada para que el usuario descargue todo su historial.
*   **Derecho al Olvido:** Workflow donde el "Soft delete" (`deletedAt`) se convierte en un borrado físico irreversible tras un periodo legal (ej. 30 días).
*   **Consent Management:** Gestión modular de cookies y rastreo publicitario.

### 3.2 Seguridad Avanzada y Auditorías
*   **Penetration Testing:** Contratación anual de agencias externas (Red Teams) para auditar la seguridad.
*   **Bug Bounty Program:** Recompensas para hackers éticos que reporten vulnerabilidades.
*   **Certificación SOC2:** Preparación de la plataforma para cumplimiento SOC2 Tipo II, requisito para la expansión B2B corporativa (Fase 6).

---

## 4. Operaciones, Soporte y Finanzas Técnicas (FinOps)

### 4.1 Accesibilidad Universal (a11y) y Soporte
*   **Cumplimiento WCAG 2.1:** Soporte nativo para lectores de pantalla, alto contraste y reducción de movimiento para usuarios sensibles.
*   **Soporte al Cliente Escalonado:** Integración de ticketing (ej. Zendesk) con SLA prioritarios para creadores de alto MRR o cuentas de marca.

### 4.2 FinOps y Eficiencia de Infraestructura
*   **Ciclo de Vida de Storage (Cold Storage):** Políticas automáticas para mover videos antiguos o de bajo engagement (ej. +90 días) a almacenamiento económico (AWS Glacier) para salvar costes.
*   **Cost Management:** Alarmas de facturación Cloud y cuotas de uso de DB para prevenir código ineficiente que dispare la factura.

---

## 5. Datos, BI e Infraestructura de Experimentación

*   **Data Warehouse y ETL:** Migración periódica de datos de PostgreSQL a un entorno analítico (ClickHouse/BigQuery) sin impactar el rendimiento transaccional.
*   **BI Dashboards Internos:** Herramientas para la directiva midiendo LTV (Life-Time Value), CAC, MRR y cohortes de retención.
*   **A/B Testing y Feature Flags:** Infraestructura para encender/apagar funcionalidades (ej. el algoritmo del feed) para el 20% de los usuarios sin redesplegar código, minimizando riesgos.

---

## 6. Mapa de Fases (Horizons) y Métricas de Éxito

### Fase 1: Consolidación del Core Social e Identidad
*Horizonte: **NOW** (En curso / Corto Plazo)*

**Funcionalidades Clave:**
*   Identidad (Passkeys), Multiformato (Posts/Stories/Frames) e Interacción (Chat 1-a-1, `lastReadAt`, `Bookmarks`).
**Métricas de Éxito (KPIs):**
*   Uptime > 99.9%, latencia (p95) < 200ms. DAU/MAU sostenidos.

### Fase 2: Motor de Discovery, Ranking y Analíticas
*Horizonte: **NEXT** (Medio Plazo)*

**Funcionalidades Clave:**
*   Búsqueda Vectorial (`pgvector`), Telemetry batching (`dwell_time`), Analíticas en BullMQ y A/B testing del nuevo feed.
**Métricas de Éxito (KPIs):**
*   Incremento del tiempo en pantalla (Dwell Time) y de conversiones en la pestaña `Explore`.

### Fase 3: Economía de Creadores y Plataforma
*Horizonte: **NEXT** (Medio Plazo)*

**Funcionalidades Clave:**
*   Integración Stripe Connect, Suscripciones (Tiers), Pay-Per-View (PPV) y Creator Dashboard.
**Métricas de Éxito (KPIs):**
*   MRR global, % de conversión free-to-paid y tasa de chargebacks controlada (< 1%).

### Fase 4: Trust & Safety, Moderación y Operaciones
*Horizonte: **LATER** (Largo Plazo)*

**Funcionalidades Clave:**
*   Colas de moderación, Appeals persistidas, Account Center y Hard Deletes automatizados.
**Métricas de Éxito (KPIs):**
*   Tiempo Promedio de Resolución (MTTR) de tickets de soporte y reducción de spam.

### Fase 5: Infraestructura de Escala y Media
*Horizonte: **Continuo / Transversal***

**Arquitectura Clave:**
*   Transcodificación HLS asíncrona, Redis Pub/Sub para chat y Feed Fan-out on write ("Thundering Herd" mitigation).
**Métricas de Éxito (KPIs):**
*   Tiempos de procesamiento de video óptimos; consumo eficiente de CPU bajo alta concurrencia.

### Fase 6: Expansión Comunitaria, B2B y APIs Públicas
*Horizonte: **LATER** (Visión a Largo Plazo)*

**Funcionalidades Clave:**
*   **Communities (Foros), Business Manager (B2B)** y **APIs Públicas (OAuth)** para integraciones de terceros (Zapier, bots).
**Métricas de Éxito (KPIs):**
*   Inversión B2B activa y número de apps de terceros utilizando el ecosistema API.
