# 01-Product-Requirements-Document
## CircleSfera
**Versión:** 3.0 alineada al proyecto real  
**Fecha:** Abril 2026  
**Fuente de verdad funcional y de datos:** `schema.prisma` actual del proyecto

> **Estado (Jul 2026):** este PRD (Abr 2026) está **parcialmente desactualizado** frente al schema vigente. Existen, entre otros, **Appeals**, **Mutes** y **CreatorSubscription** que pueden no estar reflejados aquí. Ver [00-status.md](./00-status.md). Preferir `schema.prisma` y el código implementado.

---

## 1. Resumen

CircleSfera es una red social multiformato con foco en contenido social, identidad, mensajería, monetización de plataforma, transparencia operativa y evolución progresiva hacia experiencias más ricas que una red centrada solo en posts. El producto real, según el schema actual, ya contempla posts, stories, frames, chat, bookmarks, collections, highlights, follows, blocks, notificaciones, promociones, suscripciones de plataforma, reporting, auditoría, audio, búsqueda y capacidades de embeddings para ranking o discovery. 

La documentación debe reflejar esa realidad: CircleSfera no es ya solo un MVP mínimo de posts+likes+follows, sino una plataforma social con varios subsistemas ya modelados. Por tanto, el roadmap documental debe distinguir entre **capacidades implementadas en el modelo**, **capacidades activadas en producto** y **capacidades preparadas para evolución**.

---

## 2. Visión de producto

CircleSfera busca competir en el mercado mediante una propuesta más clara para usuarios y creadores: identidad controlada, relaciones sociales explícitas, experiencias de contenido mixto, monetización first-party y una operativa de confianza más auditable.

La diferenciación no depende solo del feed, sino de combinar:

- Publicación de posts y formatos cortos.
- Stories efímeras y highlights persistentes.
- Mensajería privada y compartición de contenido en chat.
- Monetización por planes de plataforma.
- Capas de seguridad y autenticación modernas, incluyendo passkeys.
- Moderación y reporting trazables.
- Infraestructura preparada para discovery avanzado con embeddings.

---

## 3. Alcance real del producto

## 3.1 Capacidades modeladas en el proyecto

Según el `schema.prisma` actual, el producto contempla estas áreas funcionales:

- Cuentas de usuario con estado, roles, verificación y tipo de cuenta.
- Perfil desacoplado de credenciales.
- Autenticación con refresh tokens, reset tokens, verification tokens y passkeys.
- Publicación de posts con media múltiple, hashtags, etiquetas de usuarios, visibilidad, audio y tipo `POST` o `FRAME`.
- Stories con expiración, close friends, audio, vistas, reacciones y highlights.
- Likes en posts y likes en comentarios como entidades separadas.
- Comments anidados.
- Bookmarks y collections.
- Follows y blocks.
- Notificaciones entre usuarios.
- Conversaciones, participantes, mensajes, respuestas y reacciones.
- Compartición de posts y stories en chat.
- Suscripciones de plataforma y planes.
- Webhooks para billing.
- Promotions o boosts.
- Search history.
- Reportes de contenido.
- Admin audit logs.
- Audio reutilizable.
- Post embeddings con pgvector.
- Whitelist para acceso temprano.

## 3.2 Capacidades no soportadas por el schema actual

No deben figurar como parte del producto actual si no existen en el schema:

- Communities o grupos.
- Marketplace marca-creador.
- Fan-to-creator subscriptions.
- Mutes como entidad persistida.
- Appeals y moderation_actions como modelos separados.
- Feed preferences persistidas en base de datos.
- Analytics diarios modelados como tablas específicas.
- Transactions y entitlements como entidades persistidas en el schema mostrado.

---

## 4. Objetivos de producto

### 4.1 Objetivos principales

- Construir una experiencia social completa basada en identidad, contenido y mensajería.
- Dar soporte a publicación visual estándar, incluyendo stories, colecciones y highlights.
- Permitir evolución hacia recomendaciones y discovery con embeddings.
- Mantener una base apta para monetización first-party con Stripe.
- Sostener capacidades de moderación, auditoría y seguridad que den credibilidad al producto.

### 4.2 Objetivos secundarios

- Facilitar futuras capas de ranking, búsqueda semántica y personalización.
- Habilitar growth loops mediante compartición en chat, follows, stories y promociones.
- Preparar la plataforma para identidad fuerte con passkeys y niveles de verificación.

---

## 5. Usuarios y roles

### 5.1 Usuario estándar

Publica posts o stories, sigue cuentas, comenta, da like, guarda contenido, conversa por chat y consume media.

### 5.2 Creador

Publica con mayor frecuencia, usa frames, promociones, audio, tags, colecciones y busca crecimiento y monetización indirecta dentro de la plataforma.

### 5.3 Cuenta verificada o business

Utiliza niveles de verificación y suscripciones de plataforma para obtener mayor confianza, posicionamiento comercial o capacidades premium.

### 5.4 Administrador

Opera sobre reporting, auditoría y acciones administrativas. El schema ya contempla `Role.ADMIN` y `AdminAuditLog`.

> **Nota de Implementación**: Al registrar un nuevo usuario, el sistema crea automáticamente un registro en `UserSettings` con valores por defecto (`privacyLevel: PUBLIC`, `contentPreference: GENERAL`, `blurSensitiveContent: true`).

---

## 6. Módulos funcionales

### 6.1 Identidad y acceso

- Registro y login.
- Refresh tokens.
- Verificación email.
- Recuperación de cuenta.
- Passkeys / WebAuthn.
- Estados de cuenta: activa, eliminada lógicamente.
- Roles: `USER`, `ADMIN`.
- Verification levels: `BASIC`, `VERIFIED`, `BUSINESS`, `ELITE`.

### 6.2 Perfil social

- Username único en `Profile`.
- Nombre público, bio, web y ubicación.
- Avatar con variantes optimizadas.
- Privacidad de perfil centralizada en `UserSettings.privacyLevel`.

### 6.3 Contenido

- Posts con caption, media múltiple, hashtags y tags.
- Stories con expiración.
- Frames mediante `Post.type = FRAME`.
- Audio opcional en posts y stories.
- Visibilidad `PUBLIC`, `FOLLOWERS`, `PRIVATE`.
- Variantes de imagen/video por post.
- Clasificación de sensibilidad mediante `ContentRating` (`GENERAL` | `MATURE`).
- Contador de views por post.

### 6.4 Interacción

- Likes en posts.
- Likes en comentarios.
- Comentarios anidados.
- Bookmarks.
- Collections.
- Story views y story reactions.
- Compartición de posts y stories en chat.

### 6.5 Relaciones sociales

- Follows con estado `PENDING` (solicitud) o `ACCEPTED` (aprobado). Las cuentas privadas requieren aprobación manual.
- Blocks.
- Close friends para stories restringidas.
- Tagged users en posts.

### 6.6 Mensajería

- Conversations.
- Participants.
- Messages con reply.
- Shared post/story in message.
- Message reactions.
- lastReadAt por participante.

### 6.7 Monetización

- Platform plans.
- Platform subscriptions.
- Stripe customer ID en usuario.
- Webhook event log para idempotencia.
- Promotions: cargo inmediato vía Stripe PaymentIntent al crear la promoción. El estado pasa a `ACTIVE` solo tras el cobro exitoso. Reembolsos proporcionales si se cancela antes de tiempo.
- Pay-Per-View (PPV): monetización de contenido exclusivo fan-to-creator gestionado a través de Stripe Connect.


### Decisión de diseño: un plan activo por usuario

CircleSfera adopta el modelo **un plan activo por usuario en cada momento**. Un usuario no puede tener dos suscripciones activas simultáneas a diferentes planes. Esta regla se aplica en lógica de aplicación antes de crear una nueva suscripción.

**Consecuencias:**
- Al suscribirse a un plan nuevo, si existe una suscripción activa previa, el sistema debe cancelar la anterior (al final de periodo) antes de activar la nueva.
- La constraint `UNIQUE(userId, planId)` del schema previene duplicados del mismo plan, pero no previene planes distintos simultáneos. La regla de unicidad de plan activo se aplica por código.
- `GET /billing/subscription` devuelve un objeto único (no array) porque el contrato de producto garantiza máximo 1 suscripción activa.

**Estados válidos de `platform_subscriptions.status`**

| Estado        | Descripción                                              |
|---------------|----------------------------------------------------------|
| `active`      | Suscripción vigente y al día de pago                    |
| `trialing`    | En periodo de prueba gratuito                            |
| `past_due`    | Pago fallido; Stripe reintentará                         |
| `incomplete`  | Checkout iniciado pero no completado                     |
| `cancelled`   | Cancelada; acceso hasta fin de periodo si aplica         |
| `expired`     | Periodo finalizado sin renovación                        |

### 6.8 Confianza, seguridad y operación

- Reports.
- Admin audit log.
- Email verification.
- Reset tokens.
- Passkeys.
- User Settings (GDPR compliance): configuración de privacidad, preferencias de contenido y notificaciones.
- DeletedAt para soft delete.
- Activity status: online / last seen.

### 6.9 Search y discovery

- Hashtags.
- Search history.
- Post embeddings con `pgvector`.

---

## 7. Alcance por fases revisado

La documentación anterior separaba stories y frames como fase 2. Eso ya no refleja el modelo actual del producto. La adecuación correcta es esta:

### Fase actual del proyecto

- Posts: sí.
- Stories: sí.
- Frames: sí, como variante de `Post`.
- Chat: sí.
- Bookmarks y collections: sí.
- Highlights: sí.
- Subscriptions de plataforma: sí.
- Promotions: sí.
- Passkeys: sí.
- Analytics Básicos: sí, calculados en tiempo real (sin histórico persistido por ahora). Se prioriza la agilidad de consulta sobre el almacenamiento masivo de snapshots diarios en esta fase.
- Embeddings: sí como capacidad técnica.

### Fase activable / no necesariamente expuesta completa en UI

- Discovery semántico basado en embeddings.
- Promociones con gestión avanzada.
- Workflows administrativos más sofisticados sobre reports.
- Capas premium más ricas sobre planes de plataforma.

### Fase futura no modelada todavía

- Communities.
- Marketplace marca-creador.
- Payouts complejos a creadores.
- Moderation case management más detallado con appeals persistidas.

---

## 8. Principios de producto revisados

1. La documentación debe seguir al sistema real, no a una simplificación conceptual antigua.
2. Lo implementado en el schema debe figurar como capacidad del producto, aunque su exposición en UI pueda ser gradual.
3. Las funciones de confianza deben explicarse sin prometer modelos que aún no existen en base de datos.
4. Las decisiones de monetización deben considerar fraude, soporte, webhooks e idempotencia.
5. Las decisiones de contenido deben considerar crecimiento, retención, creador, chat y discovery.

---

## 9. Riesgos actuales

- La documentación previa subestima el alcance real del producto.
- Hay riesgo de desalineación entre UI activa y capacidades persistidas en base de datos.
- El modelo incluye funciones avanzadas que exigen priorización clara para no aumentar complejidad operativa sin retorno.
- Promotions y billing necesitan controles anti-fraude, reconciliación y soporte.
- Reporting existe, pero no hay aún un modelo de appeals persistido en el schema actual.

---

## 10. Decisiones documentales cerradas

- El schema actual es la fuente principal de realidad del producto.
- Stories, frames, chat, highlights, bookmarks, collections, passkeys, subscriptions y promotions pasan a formar parte de la documentación oficial.
- Se eliminan del PRD oficial las referencias a entidades no presentes en el schema como si ya fueran parte del sistema actual.
- Las futuras capacidades se documentarán como roadmap, no como realidad implementada.
