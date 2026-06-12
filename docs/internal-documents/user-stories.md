User Stories & Use Cases

CircleSfera

1.  User Stories - Core Features

User Story: Registro e Inicio de Sesión

US-001: Registro de Usuario

- Como usuario nuevo

- Quiero registrarme en CircleSfera

- Para crear mi cuenta y acceder a la plataforma

Criterios de Aceptación:

- Formulario con email, contraseña, nombre de usuario

- Validación de email único

- Password requirements: min 8 caracteres, mayúscula, número

- Email de confirmación requerido

- Redirect a perfil básico después del registro

- Verificación de edad (edad mínima 13 años)

Notas Técnicas:

- Hash de contraseña con bcrypt

- JWT token generado después de verificación

- Email enviado automáticamente

US-002: Login

- Como usuario registrado

- Quiero iniciar sesión con mis credenciales

- Para acceder a mi cuenta

Criterios de Aceptación:

- Login con email o username

- Contraseña encriptada

- Opción "Recordarme" (30 días)

- Olvide contraseña con reset

- 2FA opcional (Phase 2)

- Mostrar último acceso

User Story: Creación de Perfil

US-003: Edición de Perfil

- Como usuario

- Quiero editar mi perfil

- Para mostrar mi identidad y información

Criterios de Aceptación:

- Foto de perfil con crop

- Foto de portada

- Bio hasta 500 caracteres

- Website/links sociales

- Ubicación

- Nombre de usuario (changeable 1x/mes)

- Display name (diferente de username)

- Género, cumpleaños (opcional)

- Verificación de profesión (creadores)

Criterios de Validación:

- Foto máximo 10MB

- Formatos: JPG, PNG, WebP

- Auto-crop a 1:1 para avatar

- Auto-crop a 16:9 para portada

US-004: Preferencias de Privacidad

- Como usuario

- Quiero controlar quien ve mi contenido

- Para mantener mi privacidad

Criterios de Aceptación:

- Perfil público (visible para todos)

- Perfil privado (solo seguidores)

- Permitir/bloquear mensajes

- Permitir/bloquear menciones

- Controlar quién puede comentar

- Opción de solo seguidores ven historias

- Data sharing: opt-in explícito

User Story: Publicación de Contenido

US-005: Crear Post

- Como usuario

- Quiero publicar contenido (texto e imágenes)

- Para compartir mis momentos con mi comunidad

Criterios de Aceptación:

- Texto hasta 5000 caracteres

- Hasta 10 imágenes por post

- Drag & drop para reordenar

- Alt text para accesibilidad

- Clasificación de contenido (G/M)

- Ubicación geográfica (opcional)

- Hashtags automáticos

- Menciones (@username)

- Enlace a URL (preview automático)

- Botón publicar/borrador

Validaciones:

- Imágenes máximo 50MB c/u

- Formatos: JPG, PNG, WebP, GIF

- Detección contenido inapropiado automática

- Blur automático si necesario

Flujo de Moderación:

- Si AI score inapropiado > 0.7: marcar "Maduro"

- Usuario confirma clasificación

- Publicar inmediatamente (no queue)

US-006: Crear Story

- Como usuario

- Quiero publicar historias temporales (24h)

- Para compartir momentos efímeros

Criterios de Aceptación:

- Imagen o video (máx 60s)

- Desaparece después de 24h

- Ver quién vio mi historia

- Responder con DM (luego)

- Reacciones emoji rápidas

- Orden cronológico en feed

US-007: Crear Frame

- Como usuario creador

- Quiero publicar videos cortos (estilo Reels)

- Para alcance orgánico y monetización

Criterios de Aceptación:

- Video 15-60 segundos

- Upload o grabación desde app

- Música de librería (luego)

- Filtros y efectos básicos (luego)

- Caption y hashtags

- Compartible en otros lados

- Analytics detallados

User Story: Feed y Descubrimiento

US-008: Feed Personalizado

- Como usuario

- Quiero un feed que muestre contenido relevante

- Para descubrir contenido que me interesa

Criterios de Aceptación:

- 3 modos de algoritmo:

- Cronológico: orden de publicación

- Popular: basado en likes/comentarios

- Personalizado: basado en preferencias

- Control deslizante de preferencias

- Botón "No me interesa"

- Mute de palabras clave

- Mute temporal de usuarios (sin unfollow)

- Bloqueo de publicidades de categoría

- Filtro por contenido rating (G/M)

Performance:

- Carga inicial < 2s

- Infinite scroll sin lag

- Preload de próximas imágenes

US-009: Explore / Descubrir

- Como usuario

- Quiero descubrir contenido nuevo

- Para expandir mis horizontes

Criterios de Aceptación:

- Grid visual de posts populares

- Búsqueda de usuarios

- Búsqueda de hashtags

- Trending topics

- Categorías (arte, música, política, etc.)

- Crear colecciones de posts guardados

User Story: Interacciones

US-010: Like y Comentar

- Como usuario

- Quiero interactuar con posts

- Para expresar mi opinión

Criterios de Aceptación:

- Like/Unlike con corazón

- Contador de likes

- Comentar en posts

- Responder a comentarios (threads)

- Like a comentarios

- Editar comentario propio

- Borrar comentario propio

- Ver todos los comentarios (pagination)

- Notificación al ser comentado

- Mencionar usuarios en comentarios

US-011: Compartir

- Como usuario

- Quiero compartir posts

- Para ampliar alcance del contenido

Criterios de Aceptación:

- Repost (con/sin comentario)

- Compartir en WhatsApp

- Compartir en X/Twitter

- Copiar link

- Enviar por DM (luego)

US-012: Guardar/Bookmarks

- Como usuario

- Quiero guardar posts para después

- Para encontrarlos fácilmente

Criterios de Aceptación:

- Bookmark icon en cada post

- Colecciones personalizadas

- Vista privada de guardados

- Ordenar por fecha/relevancia

- Eliminar de guardados

User Story: Red Social

US-013: Seguir Usuarios

- Como usuario

- Quiero seguir a otros usuarios

- Para ver su contenido en mi feed

Criterios de Aceptación:

- Botón Seguir/Siguiendo

- Seguimiento privado (sin notificar)

- Perfil público: seguir automático

- Perfil privado: solicitud de seguimiento

- Aceptar/rechazar solicitud

- Ver seguidores del usuario

- Ver seguidos del usuario

- Sugerencias de a quién seguir

- Notificación cuando alguien me sigue

US-014: Bloquear y Mutear

- Como usuario

- Quiero controlar quién puede interactuar conmigo

- Para mantener mi seguridad

Criterios de Aceptación:

- Bloquear usuario (no ve mi perfil)

- Desbloquear usuario

- Lista de usuarios bloqueados

- Mutear usuario (sigo viéndolo, no notificaciones)

- Lista de usuarios muteados

User Story: Moderación y Reportes

US-015: Reportar Contenido

- Como usuario

- Quiero reportar contenido inapropiado

- Para mantener la plataforma segura

Criterios de Aceptación:

- Opciones de reporte: spam, harassment, illegal, etc

- Descripción detallada (opcional)

- Confirmación de reporte

- No revelar al denunciado

- Privacidad del reportero

- Opción de ver decisión después (luego)

US-016: Moderación Transparente

- Como usuario

- Quiero entender por qué se eliminó mi contenido

- Para evitar violaciones futuras

Criterios de Aceptación:

- Notificación clara de eliminación

- Artículo legal específico violado

- Opción de apelación inmediata

- Dashboard de historial de acciones

- Proceso de apelación (72h garantizado)

- Historial de apelaciones ganadas/perdidas

User Story: Monetización

US-017: Suscripciones Premium

- Como usuario

- Quiero suscribirme a CircleSfera Premium

- Para acceder a features avanzadas

Criterios de Aceptación:

- Tiers: Premium, Business, Elite Creator

- Beneficios: analytics avanzados, sin ads, tools de crecimiento

- Cancelar suscripción fácilmente

- Renovación automática

- Pago vía Stripe (100% plataforma)

- Dashboard de beneficios

US-018: Analytics para Creadores

- Como creador

- Quiero ver stats de mi contenido

- Para optimizar mi estrategia

Criterios de Aceptación:

- Views por post

- Likes, comentarios, shares

- Impressions y reach

- Follower growth

- Ingresos totales (de tiers)

- Perfil de audiencia (edad, ubicación)

- Mejor momento para publicar

- Exportar reports

2\. Use Cases - Flujos Complejos

Use Case: Flujo Completo de Publicación

1\. Usuario abre app

2\. Click en "+" (crear)

3\. Selecciona "Post"

4\. Escribe contenido (max 5000 caracteres)

5\. Sube imágenes (drag & drop)

6\. Sistema detecta contenido inapropiado automáticamente

7\. Si score > 0.7, sugiere clasificación "Maduro"

8\. Usuario confirma clasificación (G/M)

9\. Usuario selecciona privacidad (público/privado/friends)

10\. Usuario añade ubicación, hashtags, menciones

11\. Click en "Publicar"

12\. Post se crea inmediatamente

13\. Notificación a seguidores

14\. Aparece en feed personalizado de seguidores

15\. Analytics comienzan a contar views

Use Case: Flujo de Moderación

1\. Usuario A reporta post de Usuario B

2\. Selecciona razón del reporte

3\. Sistema crea ticket de moderación

4\. Moderador humano revisa (< 24h)

5\. Moderador verifica violación de ley específica

6\. Si violación confirmada:

- Moderador toma acción (remove, warn, ban)

- Usuario B recibe notificación con artículo legal específico

- Usuario B puede apelar en 30 días

7\. Si no hay violación:

- Reporte rechazado

- Usuario A notificado

8\. Acción se registra en transparencia report.

Use Case: Flujo de Monetización (Suscripción)

1\. Usuario ve botón "Premium" en perfil

2\. Selecciona tier (Premium/Business/Elite)

3\. Click en suscribirse

4\. Redirige a checkout (Stripe)

5\. Usuario completa pago

6\. Transacción procesada (100% plataforma)

7\. Usuario recibe beneficios inmediatos

8\. Dashboard actualizado con analytics

9\. Renovación automática.

3\. Épicas de Desarrollo

EPIC-1: MVP Core

- US-001, US-002, US-003, US-004, US-005, US-008, US-010, US-013, US-015, US-016

EPIC-2: Content Diversification

- US-006, US-007, US-009, US-011, US-012, US-014

EPIC-3: Creator Economy

- US-017, US-018
