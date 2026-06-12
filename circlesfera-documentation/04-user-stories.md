# 04-User-Stories
## CircleSfera
**Versión:** 3.0 alineada al proyecto real  
**Fecha:** Abril 2026  
**Fuente de verdad:** alcance documental actualizado + `schema.prisma` actual

---

## 1. Criterio de corrección

Este documento reemplaza la versión anterior de historias de usuario para ajustarla a la realidad del proyecto. La corrección principal es que ya no se documenta CircleSfera como un MVP reducido de posts y follows, sino como una plataforma cuyo modelo actual ya soporta stories, frames como variante de post, bookmarks, collections, highlights, chat, passkeys, promotions, reporting y planes de plataforma.

También se eliminan historias que dependían de entidades no presentes en el schema actual, como `mutes` persistidos, `appeals` persistidas, `moderation_actions` persistidas, configuraciones de feed guardadas en tabla específica o analytics detalladas respaldadas por tablas propias.

---

## 2. Épicas vigentes

### EPIC-1: Identidad y acceso
Incluye registro, login, refresh token, recuperación de contraseña, verificación de email y passkeys.

### EPIC-2: Perfil y cuenta
Incluye edición de perfil, privacidad de cuenta, visibilidad pública/privada y estado social básico.

### EPIC-3: Publicación y contenido
Incluye posts, frames como tipo de post, media, hashtags, tags, comentarios, likes y visibilidad.

### EPIC-4: Stories y capas efímeras
Incluye stories, vistas, reacciones, close friends y highlights.

### EPIC-5: Interacción social
Incluye follows, blocks, bookmarks, collections y notificaciones.

### EPIC-6: Messaging
Incluye conversaciones, mensajes, replies, reacciones y compartición de posts/stories en chat.

### EPIC-7: Monetización de plataforma
Incluye planes, suscripciones, webhooks e iniciativas de promotion/boost.

### EPIC-8: Trust, safety y operación
Incluye reports, auditoría administrativa, verificación, seguridad de cuentas y trazabilidad operativa.

### EPIC-9: Search y discovery
Incluye búsqueda de usuarios/hashtags, historial de búsqueda y evolución hacia recomendaciones basadas en embeddings.

---

## 3. Historias de usuario

## 3.1 Auth

### US-001 Registro
**Como** visitante  
**Quiero** crear una cuenta con email, contraseña y username  
**Para** acceder a CircleSfera

**Criterios de aceptación**
- El sistema valida email único.
- El sistema valida username único.
- Se crea `User` y `Profile` iniciales.
- Se emite flujo de verificación de email.
- La contraseña se guarda hasheada.

### US-002 Login
**Como** usuario registrado  
**Quiero** iniciar sesión con email y contraseña, y más adelante con passkey  
**Para** acceder de forma segura

**Criterios de aceptación**
- El sistema permite login por email.
- Se emite access token y refresh token.
- El usuario puede cerrar sesión revocando sesiones activas.
- El sistema puede incorporar login con passkey sin rediseñar la cuenta.

### US-003 Recuperación de cuenta
**Como** usuario  
**Quiero** resetear mi contraseña  
**Para** recuperar acceso si la olvido

**Criterios de aceptación**
- El sistema genera token temporal de reset.
- El sistema invalida el token tras uso o expiración.
- La contraseña nueva reemplaza la anterior de forma segura.

### US-004 Verificación con passkey
**Como** usuario preocupado por la seguridad  
**Quiero** registrar una passkey  
**Para** mejorar autenticación y reducir riesgo de takeover

**Criterios de aceptación**
- El sistema genera challenge temporal.
- El sistema almacena credencial WebAuthn asociada al usuario.
- El usuario puede iniciar sesión con passkey cuando la funcionalidad esté activada en interfaz.

---

## 3.2 Perfil

### US-005 Edición de perfil
**Como** usuario  
**Quiero** editar mi perfil público  
**Para** mostrar identidad y contexto

**Criterios de aceptación**
- Puedo editar `fullName`, `bio`, `website` y `location`.
- Puedo cambiar `username` según reglas de producto.
- Puedo subir avatar y sus variantes optimizadas.
- El perfil queda desacoplado de credenciales.

### US-006 Privacidad de perfil
**Como** usuario  
**Quiero** marcar mi perfil como privado  
**Para** controlar quién ve mi contenido

**Criterios de aceptación**
- Un perfil privado requiere follow aceptado.
- Las solicitudes de follow usan el mismo modelo `Follow` con estado.
- La UI muestra claramente si una relación está pendiente o aceptada.

---

## 3.3 Posts y frames

### US-007 Crear post
**Como** usuario  
**Quiero** publicar texto y media  
**Para** compartir contenido con mi audiencia

**Criterios de aceptación**
- Puedo crear un post con caption opcional.
- Puedo adjuntar varias piezas de media ordenadas.
- Puedo definir ubicación y visibilidad.
- Puedo ocultar likes o desactivar comentarios.
- Puedo asociar audio si el producto lo habilita en UI.

### US-008 Crear frame
**Como** creador  
**Quiero** publicar un frame  
**Para** distribuir un contenido corto dentro del mismo núcleo de publicación

**Criterios de aceptación**
- El frame se modela como `Post.type = FRAME`.
- El flujo reutiliza el sistema de media, hashtags, caption y visibilidad.
- No existe una entidad separada de datos para frame.

### US-009 Etiquetar usuarios y hashtags
**Como** usuario  
**Quiero** etiquetar cuentas y asociar hashtags  
**Para** aumentar contexto y descubrimiento

**Criterios de aceptación**
- Puedo asociar hashtags al post.
- Puedo etiquetar usuarios en coordenadas sobre el contenido.
- El sistema persiste tags y hashtags como relaciones específicas.

### US-010 Interactuar con posts
**Como** usuario  
**Quiero** dar like, comentar y guardar posts  
**Para** participar y volver al contenido relevante

**Criterios de aceptación**
- El like se registra en tabla específica de posts.
- Los comentarios soportan replies anidados.
- El guardado se registra como bookmark.
- El bookmark puede asociarse a una collection.

---

## 3.4 Stories

### US-011 Crear story
**Como** usuario  
**Quiero** publicar una story efímera  
**Para** compartir momentos temporales

**Criterios de aceptación**
- La story tiene expiración a 24h o según regla de producto.
- Puede incluir imagen o video.
- Puede asociar audio.
- Puede ser solo para close friends.

### US-012 Ver y reaccionar a stories
**Como** usuario  
**Quiero** ver stories y reaccionar a ellas  
**Para** interactuar de forma ligera

**Criterios de aceptación**
- El sistema registra `StoryView` por viewer.
- El sistema registra `StoryReaction` por usuario.
- La UI evita duplicados de reacción si así lo decide negocio.

### US-013 Gestionar highlights
**Como** usuario  
**Quiero** guardar stories en highlights  
**Para** hacer persistente parte de mi contenido efímero

**Criterios de aceptación**
- Puedo crear un highlight.
- Puedo añadir o quitar stories de un highlight.
- Los highlights pertenecen al usuario.

---

## 3.5 Red social

### US-014 Seguir cuentas
**Como** usuario  
**Quiero** seguir otras cuentas  
**Para** ver su contenido en mi experiencia social

**Criterios de aceptación**
- Si el perfil es público, el follow puede aceptarse automáticamente.
- Si el perfil es privado, la relación queda `PENDING` hasta aprobación.
- El sistema impide duplicados.

### US-015 Bloquear cuentas
**Como** usuario  
**Quiero** bloquear otra cuenta  
**Para** proteger mi experiencia y seguridad

**Criterios de aceptación**
- El bloqueo queda persistido.
- El sistema impide duplicados de block.
- La lógica de producto limita visibilidad e interacción entre ambas partes.

### US-016 Recibir notificaciones
**Como** usuario  
**Quiero** recibir notificaciones relevantes  
**Para** enterarme de actividad social y operativa

**Criterios de aceptación**
- El sistema genera notificaciones para eventos compatibles con el modelo.
- Puedo marcar notificaciones como leídas.
- Las notificaciones soportan remitente y, opcionalmente, referencia a post.

---

## 3.6 Messaging

### US-017 Conversar por chat
**Como** usuario  
**Quiero** tener conversaciones privadas o grupales  
**Para** comunicarme dentro de CircleSfera

**Criterios de aceptación**
- Puedo formar parte de una conversación.
- Puedo enviar mensajes de texto.
- Puedo responder a un mensaje anterior.
- El sistema registra lectura por participante.

### US-018 Compartir contenido en chat
**Como** usuario  
**Quiero** compartir posts o stories por mensaje  
**Para** recomendar contenido sin salir del producto

**Criterios de aceptación**
- Un mensaje puede referenciar un `postId` o `storyId`.
- La conversación sigue funcionando aunque el mensaje no tenga texto.
- La UI renderiza vista previa según permisos y existencia del contenido.

### US-019 Reaccionar a mensajes
**Como** usuario  
**Quiero** reaccionar a un mensaje  
**Para** responder de forma rápida

**Criterios de aceptación**
- Un usuario puede tener una reacción por mensaje si esa es la regla elegida.
- La reacción queda persistida en `MessageReaction`.

---

## 3.7 Monetización

### US-020 Suscribirme a un plan
**Como** usuario  
**Quiero** contratar un plan de plataforma  
**Para** acceder a beneficios asociados al tier

**Criterios de aceptación**
- Puedo consultar catálogo de `PlatformPlan`.
- El alta se ejecuta con Stripe.
- El estado de la suscripción se persiste en `PlatformSubscription`.
- La sincronización final depende de webhook procesado correctamente.

### US-021 Gestionar suscripción
**Como** usuario  
**Quiero** consultar o cancelar mi suscripción  
**Para** mantener control sobre cobros y beneficios

**Criterios de aceptación**
- Puedo ver plan activo y periodos de facturación.
- Puedo solicitar cancelación al final de periodo.
- La UI refleja `cancelAtPeriodEnd` y estado final.

### US-022 Lanzar una promotion
**Como** usuario o creador elegible  
**Quiero** promocionar un contenido  
**Para** aumentar alcance de forma explícita y pagada

**Criterios de aceptación**
- La promotion referencia `targetType` y `targetId`.
- Tiene presupuesto, moneda, estado y ventana temporal.
- El sistema valida por aplicación que el target exista y sea promocionable.

---

## 3.8 Moderación y operación

### US-023 Reportar contenido o cuenta
**Como** usuario  
**Quiero** reportar un post o una cuenta  
**Para** contribuir a la seguridad de la plataforma

**Criterios de aceptación**
- El reporte incluye `targetType`, `targetId`, razón y detalles opcionales.
- El usuario recibe confirmación de envío.
- El reporte queda disponible para revisión operativa.

### US-024 Auditar acciones administrativas
**Como** operador o admin  
**Quiero** que ciertas acciones queden auditadas  
**Para** tener trazabilidad interna

**Criterios de aceptación**
- Las acciones se registran en `AdminAuditLog`.
- El log incluye actor, acción, target y detalles.

### US-025 Verificación de cuenta
**Como** plataforma  
**Quiero** diferenciar niveles de verificación  
**Para** gestionar confianza, identidad y tipos de cuenta

**Criterios de aceptación**
- El usuario tiene `verificationLevel` y `accountType`.
- La UI y negocio pueden derivar badges o capacidades desde esos campos.

---

## 3.9 Search y discovery

### US-026 Buscar usuarios y hashtags
**Como** usuario  
**Quiero** buscar cuentas y temas  
**Para** descubrir contenido relevante

**Criterios de aceptación**
- Puedo buscar perfiles por username.
- Puedo buscar hashtags.
- El sistema puede guardar historial de búsqueda del usuario.

### US-027 Descubrimiento futuro por similitud
**Como** producto  
**Quiero** poder recomendar contenido similar  
**Para** mejorar discovery sin rehacer el modelo de datos

**Criterios de aceptación**
- Los posts pueden tener embedding asociado.
- La funcionalidad puede activarse más adelante sin cambiar el modelo principal.

### US-028 Configuración de privacidad y notificaciones [NEW]
**Como** usuario  
**Quiero** gestionar mis preferencias de privacidad, contenido y notificaciones  
**Para** tener control sobre mi experiencia y cumplir con GDPR

**Criterios de aceptación**
- Puedo cambiar mi `privacy_level` (público, seguidores, privado).
- Puedo elegir mi `content_preference` (general, mature).
- Puedo activar/desactivar el desenfoque de contenido sensible.
- Puedo gestionar alertas por email y notificaciones push.
- El sistema persiste estos cambios en `UserSettings`.

---

## 4. Historias retiradas o reformuladas

Estas historias dejan de figurar como oficiales en su forma anterior:

- Mute persistido como entidad propia.
- Appeals persistidas como módulo cerrado.
- Moderation actions como tabla ya implementada.
- Feed preferences persistidas como recurso oficial.
- Analytics detalladas respaldadas por tablas dedicadas ya disponibles.
- Frames como entidad independiente de datos.

---

## 5. Prioridad recomendada

### Prioridad inmediata
- Auth.
- Profile.
- Posts.
- Comments.
- Likes.
- Follows.
- Blocks.
- User Settings (Privacidad y GDPR).
- Stories.
- Notifications.
- Billing base.

### Prioridad siguiente
- Bookmarks y collections.
- Messaging.
- Highlights.
- Search history.
- Promotions.

### Prioridad posterior
- Passkeys UX completa.
- Embedding-based discovery.
- Operativa avanzada de admin.
