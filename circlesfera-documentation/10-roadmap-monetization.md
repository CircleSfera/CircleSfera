# Roadmap: Post-Core, Crecimiento y Monetización

CircleSfera ya cuenta con un core social sólido (feed, perfiles, posts, frames, stories y chat). El siguiente paso estratégico es la evolución hacia una plataforma donde la distribución dependa de señales reales, la monetización se consolide en suscripciones estructuradas y los creadores cuenten con analíticas accionables.

Este roadmap detalla las fases para implementar un sistema coherente de ranking, suscripciones por niveles (Tiers) e insignias, junto con herramientas de promoción nativas que respeten las políticas de cumplimiento (compliance) de proveedores de pago como Stripe.

---

## 1. Sistema de Señales y Ranking

Antes de potenciar herramientas comerciales, la distribución debe basarse en un sistema robusto de eventos.

### Eventos mínimos de seguimiento
El motor de analíticas debe registrar de forma fiable:
- `impression`, `view_start`, `view_complete`
- `dwell_time` (tiempo de retención)
- `like`, `comment`, `save`, `share`
- `hide`, `report`
- `profile_click`, `follow`
- `subscription_click`, `subscription_success`
- `sponsored_placement_click`

### Ranking por Superficie
- **Feed Following:** Basado en afinidad (historial de DMs, interacciones pasadas), calidad (saves/shares) y recencia.
- **Explore:** Foco en descubrimiento (novelty), ratio de saves y `follows after view`.
- **Stories/Frames:** Priorización por tasa de completitud (`completion rate`), respuestas y repeticiones de visualización.

> [!TIP]
> **Transparencia algorítmica**: CircleSfera debe permitir a los usuarios entender por qué ven un contenido (ej. "Porque diste like a posts similares" o "Porque sigues a X"), aumentando la confianza en la plataforma.

---

## 2. Monetización Segura: Tier Subscriptions

Tras problemas de cumplimiento con el modelo Pay-Per-View (PPV), la estrategia de monetización exclusiva de CircleSfera pivotará hacia un modelo más estable, predecible y transparente para procesadores de pagos (Stripe): **Las Suscripciones por Niveles (Tier Subscriptions)**.

### Características del Modelo
- **Suscripciones de Plataforma / Creador:** Diferentes niveles (Tiers) que otorgan beneficios específicos.
- **Insignias (Badges):** Los suscriptores reciben insignias visibles en sus perfiles y comentarios según su Tier de suscripción, incentivando el estatus social.
- **Acceso Exclusivo:** Los creadores pueden publicar contenido exclusivo solo para suscriptores (ej. Stories privadas o Posts bloqueados).

### Reglas y Compliance
- **Un plan activo a la vez:** Como dicta el PRD principal, un usuario solo puede tener un Tier activo simultáneamente para evitar fraude o confusiones en facturación.
- **Trazabilidad (Ledger):** Todos los intentos, fallos, cobros y payouts deben registrarse en un log auditable.

---

## 3. Creator Dashboard

El Dashboard no debe ser una vitrina de métricas superficiales ("vanity metrics"), sino una herramienta operativa para que el creador convierta audiencia en suscriptores.

### Módulos Principales
- **Overview:** Alcance, followers ganados, conversiones a Tiers y revenue recurrente mensual (MRR).
- **Content Analytics:** Desglose por pieza (impresiones, tiempo de visualización, guardados y ratio de conversión a follow/suscripción).
- **Audience & Tiers:** Distribución geográfica de los seguidores, horas de mayor actividad y retención de suscriptores según la insignia adquirida.

---

## 4. Sponsored Placements (Ubicaciones Patrocinadas)

Para impulsar el crecimiento orgánico de los creadores sin entrar en conflicto con normativas de manipulación de algoritmos, se implementarán **Sponsored Placements** (evitando estrictamente el término "Boost Content" ante Stripe).

### Flujo de Publicidad Nativa
1. El creador selecciona un post o frame ya publicado.
2. Pulsa en **Promocionar**.
3. Define un objetivo: *Profile visits, Follows, o Conversiones a Tier*.
4. Define un presupuesto diario y segmentación básica (intereses, país).
5. Las métricas de este anuncio se consolidan de forma nativa en el *Creator Dashboard*.

> [!WARNING]
> Para garantizar el cumplimiento comercial (compliance), los Sponsored Placements se marcarán explícitamente como "Patrocinado" (Sponsored) ante los usuarios, asegurando total transparencia.

---

## 5. Trust & Safety y Panel de Operaciones

La escalabilidad financiera exige un panel de administración robusto para proteger la plataforma.

- **Admin Panel:** Revisión de campañas de Sponsored Placements, gestión de reembolsos (refunds) y seguimiento de reportes de usuarios.
- **Anti-Abuso:** Límite de tasa en registros, detección conductual de spam y protección contra creación masiva de cuentas para inflar analíticas.
- **Linked Accounts:** Manejo legítimo de múltiples cuentas (Personal, Creador, Business) a través de un único "Account Center", evitando falsos positivos de baneos.

---

## Roadmap Resumido por Fases

1. **Fase 1 (Ranking y Datos):** Implementar la capa de eventos, el motor de ranking y la explicabilidad del feed ("Por qué veo esto").
2. **Fase 2 (Suscripciones por Tiers):** Implementación integral del flujo de Stripe para Tiers, insignias en perfiles y limitación de contenido exclusivo.
3. **Fase 3 (Creator Dashboard):** Lanzamiento de analíticas accionables orientadas a optimizar el crecimiento orgánico y las suscripciones.
4. **Fase 4 (Sponsored Placements):** Activación de publicidad nativa (compliance-friendly) y revisión de campañas en el panel de admin.
5. **Fase 5 (Business Manager Avanzado):** Roles de equipo, facturación corporativa y campañas complejas B2B separadas del dashboard de creadores.
