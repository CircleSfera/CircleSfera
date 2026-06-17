# 06-Security-Privacy-Compliance
## CircleSfera
**Versión:** 3.0 alineada al proyecto real  
**Fecha:** Abril 2026  
**Fuente de verdad:** producto real documentado + stack técnico actual + schema actual

---

## 1. Objetivo

Este documento sustituye la versión anterior de seguridad, privacidad y compliance para alinearla con el sistema real de CircleSfera. La corrección principal es doble:

1. Debe reflejar las capacidades reales del modelo actual, incluyendo passkeys, refresh tokens, reports, admin audit logs, stories, chat, promotions y billing con Stripe.
2. No debe prometer mecanismos persistidos que el schema actual no modela explícitamente, como `mutes`, `appeals`, `moderation_actions`, `feed_preferences` o analítica persistida detallada.

---

## 2. Principios

- Security by design.
- Privacy by design.
- Least privilege.
- Defense in depth.
- Auditabilidad de acciones sensibles.
- Datos mínimos necesarios.
- Cumplimiento pragmático y documentado.

---

## 3. Superficie real a proteger

CircleSfera no es solo auth + posts. La superficie real incluye:

- Cuentas de usuario y perfiles.
- Refresh tokens.
- Passkeys.
- Media uploads para posts, stories, avatar y mensajes.
- Conversations y messages.
- Billing metadata con Stripe.
- Webhook events.
- Reports.
- Admin audit logs.
- Search history.
- Presence básica (`isOnline`, `lastSeenAt`).
- Promotions.
- Post embeddings.

Esto implica que los riesgos de seguridad y privacidad son mayores que en un MVP documental reducido.

---

## 4. Autenticación y autorización

### 4.1 Autenticación soportada
- Password + JWT access token.
- Refresh tokens persistidos.
- Flujos de verificación de email.
- Reset de contraseña.
- Passkeys/WebAuthn.

### 4.2 Reglas recomendadas
- Access tokens cortos.
- Refresh tokens revocables y rotables.
- Hashing fuerte de contraseña.
- Revocación de sesiones en eventos sensibles.
- MFA mediante passkeys como evolución prioritaria frente a SMS.

### 4.3 Autorización

El schema actual solo muestra `Role` a nivel usuario y no modela un RBAC complejo por tabla. La política oficial debe decir que:

- Existe al menos rol `USER` y `ADMIN`.
- Cualquier permiso adicional por plan o verificación debe resolverse en aplicación, no asumirse como RBAC persistido completo.
- No se debe documentar un sistema de permisos finos como si ya existiera persistido si no está implementado realmente.

---

## 5. Protección de datos

### 5.1 Datos especialmente sensibles o delicados
- Email.
- Password hash.
- Refresh tokens.
- Verification/reset tokens.
- Stripe customer/subscription metadata.
- Mensajes privados.
- Reports.
- Audit logs.
- Historial de búsqueda.
- Datos de presencia.

### 5.2 Medidas mínimas
- Cifrado en tránsito con TLS.
- Cifrado en reposo para base de datos y object storage.
- Secret management centralizado.
- Logging sin exponer PII innecesaria.
- Acceso restringido a tablas de reports, audit y billing.

### 5.3 Datos que no deben prometerse como cifrados campo a campo sin implementación real
La versión anterior listaba cifrado específico en ciertos campos sensibles, pero eso debe documentarse con precisión. Si no hay implementación real de cifrado a nivel aplicación o columna, debe decirse “protegido por cifrado en reposo y controles de acceso”, no “cifrado campo a campo” como hecho consumado.

---

## 6. Privacidad y GDPR

### 6.1 Principios aplicables
- Minimización.
- Limitación de propósito.
- Conservación limitada.
- Transparencia.
- Control del usuario cuando sea viable.
- **Privacy by Default**: Los perfiles privados requieren aprobación explícita de solicitudes de seguimiento (`PENDING` -> `ACCEPTED`).

### 6.2 Derechos del usuario
CircleSfera debe poder soportar operativamente:

- Acceso a datos personales.
- Rectificación de perfil y cuenta.
- Borrado o soft-delete con proceso de purge posterior.
- Portabilidad razonable de datos.
- Oposición a tratamientos opcionales.

### 6.3 Lo que debe corregirse respecto a la documentación anterior
- No afirmar endpoints concretos de exportación o dashboard GDPR como si ya existieran si no están definidos realmente en API actual.
- No afirmar un “DPO designado” o auditorías formales si todavía no existen de verdad.
- No afirmar “consent preferences persistidas” si no existe modelo específico de almacenamiento y gestión.

### 6.4 Retención de datos

> ⚠️ Esta sección tiene implicaciones legales y fiscales. Debe revisarse con asesoría especializada antes de publicarse como política final. Los plazos aquí son recomendaciones operativas iniciales.

| Tipo de dato                    | Retención recomendada                                            | Mecanismo                                    |
|---------------------------------|------------------------------------------------------------------|----------------------------------------------|
| Cuenta activa                   | Mientras exista base legítima de tratamiento                    | Ninguno — retención indefinida mientras activo|
| Cuenta eliminada (soft delete)  | **Grace period de 30 días** antes de eliminación física completa | Soft delete vía `deletedAt`; purge automático a los 30 días |
| Refresh tokens                  | Hasta expiración o revocación explícita                         | TTL en base de datos                          |
| Verification / reset tokens     | Hasta uso o expiración (máx. 24h-72h)                           | TTL en base de datos                          |
| Mensajes privados               | **Retención configurable por mensaje (`expiresAt`)**            | **Purge automático tras expiración**          |
| Search history                  | Máximo 90 días desde creación; purge automático                 | Job periódico sobre campo `expiresAt`        |
| Reports                         | 2 años desde `resolvedAt` o `createdAt` si no resuelto          | Retención larga por obligaciones de seguridad |
| Admin audit logs                | 3 años mínimo                                                    | Sin purge automático; archivado tras año 1    |
| Logs operativos (request/error) | 30–90 días según nivel de sensibilidad                          | Política de log rotation                      |
| Billing records                 | Según obligación legal aplicable (mínimo 5 años en ES/UE)       | Sin purge; archivado en frío tras año 1       |
| Webhook events (payload)        | Ver sección 9.4                                                  | Ver sección 9.4                              |
| Post embeddings                 | Mientras el post exista                                          | Cascade delete con post                       |
| Presencia (`isOnline`, `lastSeenAt`) | Solo valor actual; no histórico persistido                 | Sobreescritura directa                        |

---

## 7. Seguridad de media

### 7.1 Riesgos
- Malware en archivos.
- Contenido ilegal o sensible.
- Exposición pública accidental.
- Enumeración de URLs.
- Reuso no autorizado de media privada.

### 7.2 Controles
- Validación MIME real.
- Límite de tamaño y duración.
- Escaneo antivirus.
- Pipeline de moderación automatizada.
- Variantes de imagen/video procesadas en backend.
- Buckets privados y entrega controlada cuando aplique.
- **Content Rating System**: Clasificación de contenido en `GENERAL` y `MATURE` para filtrar contenido sensible según preferencia del usuario.

### 7.3 Áreas especialmente sensibles
- Stories.
- Mensajes con media.
- Avatares y uploads de perfil.
- Compartición de contenido por chat.

---

## 8. Chat y contenido privado

El producto actual ya contempla mensajería. Eso cambia de forma importante el marco de seguridad y privacidad.

### Reglas mínimas
- Los mensajes deben tratarse como datos privados.
- El acceso debe estar limitado a participantes y personal autorizado bajo políticas claras.
- Los attachments en mensajería deben pasar controles de seguridad equivalentes a los del resto de media.
- Debe existir política interna de acceso a mensajes para soporte, abuso o requerimientos legales.

Si en el futuro se decide moderación proactiva de DMs, eso debe documentarse con cuidado por impacto legal y reputacional.

### Privacidad de Perfil
- **Perfil Público**: Todo el contenido es visible para cualquier usuario (o invitado). Los seguidores se aceptan automáticamente.
- **Perfil Privado**: Solo los seguidores con estado `ACCEPTED` pueden ver posts y stories. Las nuevas solicitudes quedan en estado `PENDING` hasta que el usuario las aprueba o rechaza.

---

## 9. Billing y fraude

### 9.1 Modelo real
CircleSfera usa Stripe y persiste `PlatformPlan`, `PlatformSubscription` y `WebhookEvent`.

### 9.2 Controles clave
- Verificación de firma de webhook (`Stripe-Signature` header).
- Idempotencia por `externalId` único en `webhook_events`.
- Reconciliación periódica de estados entre Stripe y base de datos.
- Separación clara entre éxito de checkout y activación definitiva tras webhook procesado.
- Alertas sobre webhooks en estado `failed` o no procesados tras ventana de tiempo.

### 9.3 Riesgos operativos
- Suscripción activa en Stripe pero no reflejada en BD (webhook perdido o fallido).
- Duplicado de webhooks procesados dos veces (mitigado por idempotencia en `externalId`).
- Webhooks retrasados que llegan fuera de orden respecto a acciones del usuario.
- Soporte complejo por cancelaciones, reembolsos y cargos disputados.

### 9.4 Retención y seguridad de `webhook_events`

Los eventos de Stripe persisten el payload completo, que puede contener metadatos de pago, IDs de suscripción e información financiera sensible.

**Política de retención de `webhook_events`**

| Campo          | Acción tras procesado                                                     |
|----------------|---------------------------------------------------------------------------|
| `payload`      | Purge del contenido a los **30 días** desde `processedAt`; conservar solo `externalId`, `status`, `processedAt` |
| `provider`     | Conservar indefinidamente                                                 |
| `externalId`   | Conservar indefinidamente (necesario para idempotencia futura)            |
| `status`       | Conservar indefinidamente                                                 |
| `createdAt`    | Conservar indefinidamente                                                 |
| `processedAt`  | Conservar indefinidamente                                                 |

**Controles adicionales sobre `webhook_events`**
- El payload no debe loggearse en ningún sistema de observabilidad externo completo.
- El acceso a la tabla `webhook_events` debe estar restringido a rol ADMIN y al servicio de billing.
- Si se decide retener el payload más de 30 días, debe justificarse operativamente y documentarse como decisión explícita.
- Evaluar ofuscar o excluir del payload campos especialmente sensibles antes de persistir (ej: últimos 4 dígitos de tarjeta, datos de cliente en eventos de Stripe que lo incluyan).

> ⚠️ La política exacta de retención de datos de facturación tiene implicaciones legales y fiscales. Revisar con asesoría antes de fijarla como política pública. En España, la Ley del IVA y normativa mercantil pueden exigir conservar registros de facturación por plazos de 4–10 años, pero eso no implica necesariamente conservar el payload JSON completo de Stripe.

---

## 10. Moderación y reporting

### 10.1 Realidad actual del modelo
El schema actual soporta `Report` y `AdminAuditLog`, pero no una estructura persistida completa de `Appeal` ni `ModerationAction` como modelos separados.

### 10.2 Implicación documental
- La política pública puede hablar de revisión, notificación y reconsideración.
- La política interna no debe presentar un sistema persistido de apelaciones como si ya existiera en datos si todavía no está modelado.

### 10.3 Anti-shadowbanning
Si CircleSfera quiere defender una postura de transparencia, cualquier reducción artificial de visibilidad debería ser excepcional, documentada y trazable. Esa promesa tiene implicaciones legales y reputacionales y debe formularse con precisión, no como slogan absoluto imposible de cumplir operativamente.

---

## 11. Logs y auditoría

### 11.1 Logs operativos
- Request logs.
- Error logs.
- Security event logs.
- Billing logs.

### 11.2 Auditabilidad real

`AdminAuditLog` es la base de trazabilidad administrativa. Debe usarse obligatoriamente para:

- Cambios de estado de cuenta (suspensión, desactivación, baneo).
- Acciones sobre reports (resolución, rechazo, escalado).
- Intervenciones sobre contenido (eliminación, restricción, etiquetado).
- Decisiones manuales de soporte sobre suscripciones o pagos.
- Modificaciones administrativas sobre perfiles u otros recursos sensibles.

### 11.3 Vocabulario obligatorio de `AdminAuditLog`

Para garantizar trazabilidad real y auditable, los valores del campo `action` y `targetType` deben seguir este contrato cerrado. Valores fuera de este vocabulario no deben registrarse en producción sin revisión.

**Valores válidos para `action`**

| Valor                      | Descripción                                                  |
|----------------------------|--------------------------------------------------------------|
| `BAN_USER`                 | Desactiva la cuenta de forma permanente                      |
| `UNBAN_USER`               | Reactiva una cuenta previamente baneada                      |
| `DELETE_USER`              | Borrado físico o soft-delete definitivo de usuario            |
| `UPDATE_USER_STATUS`       | Cambio manual de estado (verificado, tipo de cuenta, etc.)   |
| `DELETE_POST`              | Eliminación física de un post por moderación                 |
| `DELETE_COMMENT`           | Eliminación de comentario por moderación                     |
| `DELETE_STORY`             | Eliminación de story por moderación                          |
| `CONTENT_REMOVED`          | Genérico: contenido retirado tras reporte                    |
| `CONTENT_RESTRICTED`       | Contenido oculto o con visibilidad reducida                  |
| `CONTENT_LABELED`          | Etiquetado con advertencia de contenido sensible             |
| `REPORT_REVIEWED`          | Reporte marcado como visto por un admin                      |
| `REPORT_RESOLVED`          | Reporte cerrado con una acción tomada                        |
| `REPORT_DISMISSED`         | Reporte cerrado sin acción (falso positivo)                  |
| `REPORT_ESCALATED`         | Escalado a un nivel superior de moderación                   |
| `UPDATE_WHITELIST`         | Modificación manual de entrada en whitelist                  |
| `DELETE_WHITELIST`         | Eliminación de entrada en whitelist                          |
| `ACCOUNT_WARNED`           | Envío de advertencia formal al usuario                       |
| `ACCOUNT_SUSPENDED`        | Suspensión temporal de funciones                             |
| `ACCOUNT_RESTORED`         | Restauración de privilegios tras sanción                     |
| `SUBSCRIPTION_ADJUSTED`    | Ajuste manual de plan o fechas de suscripción                |
| `SUBSCRIPTION_CANCELLED`   | Cancelación administrativa de suscripción                    |
| `PROMOTION_REJECTED`       | Rechazo de solicitud de promoción                            |
| `CREATE_AUDIO`             | Creación de track de audio oficial                           |
| `UPDATE_AUDIO`             | Edición de metadatos de audio                                |
| `DELETE_AUDIO`             | Retirada de audio del catálogo público                       |
| `MANUAL_OVERRIDE`          | Acción de emergencia o no categorizada                       |

**Valores válidos para `targetType`**

| Valor          | Descripción                          |
|----------------|--------------------------------------|
| `user`         | Acción sobre una cuenta de usuario   |
| `post`         | Acción sobre un post o frame         |
| `comment`      | Acción sobre un comentario           |
| `story`        | Acción sobre una story               |
| `message`      | Acción sobre un mensaje              |
| `report`       | Acción sobre un report               |
| `subscription` | Acción sobre una suscripción         |
| `promotion`    | Acción sobre una promotion           |

### 11.4 Regla
No registrar secretos ni payloads innecesarios en logs. Evitar especialmente: tokens, passwords, credenciales, contenidos privados completos o PII excesiva en el campo `details`.

---

## 12. Compliance aplicable

### 12.1 GDPR / LOPDGDD
Aplica claramente por tratamiento de datos personales de usuarios UE.

### 12.2 DSA
Si CircleSfera opera como plataforma online con contenido de usuarios en la UE, la transparencia de moderación, reportes y mecanismos de reclamación será relevante. La documentación debe ser prudente: una cosa es aspiración de producto y otra cumplimiento formal completo.

### 12.3 ePrivacy / cookies
Solo debe prometerse gestión granular de cookies y consent si la implementación real existe.

### 12.4 PCI DSS
Stripe reduce alcance, pero no elimina obligaciones de seguridad sobre webhooks, control de accesos y metadatos de suscripción.

---

## 13. Testing y validación

### Mínimos exigibles
- SAST y dependency scanning en CI.
- Scan de contenedores si hay Docker.
- Tests de auth y autorización.
- Tests de webhooks.
- Tests de upload seguro.
- Revisión periódica de dependencias.
- Pentest o revisión externa cuando el producto y tráfico lo justifiquen.

---

## 14. Decisiones cerradas

- Se incorpora passkeys al documento oficial de seguridad.
- Se incorpora chat como superficie explícita de privacidad y seguridad.
- Se incorpora billing real con webhooks como flujo crítico.
- Se elimina del documento oficial cualquier afirmación cerrada sobre `mutes`, `appeals`, `moderation_actions`, `feed_preferences` y dashboards GDPR no implementados como realidad técnica actual.
- Toda promesa pública de transparencia o cumplimiento debe poder sostenerse operativamente.
