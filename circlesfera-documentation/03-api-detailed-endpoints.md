# 03-API-Detailed-Endpoints
## CircleSfera REST API
**Versión:** 3.0 corregida  
**Fecha:** Abril 2026  
**Objetivo del documento:** Definir los endpoints del MVP real alineados con PRD, TRD y modelo de datos corregido.

---

## 1. Criterios de corrección

Este documento define la especificación de la API v4.0, alineada con el modelo de datos más reciente que incorpora Stories, Promociones, Facturación Anual y un sistema de Privacidad avanzado estilo Instagram. Se corrigen incoherencias previas y se consolidan los nuevos enums como `PromotionStatus`, `ContentRating` y `Visibility`.

---

## 2. Convenciones generales

- **Base URL**: `https://api.circlesfera.com/v1`
- **Formato**: JSON UTF-8, salvo uploads con `multipart/form-data`
- **Auth**: Bearer JWT para rutas protegidas
- **Rate limiting base**: por IP y por usuario, con políticas específicas por endpoint
- **Paginación estándar**: preferencia por cursor o por `page/limit` consistente; para MVP se documenta `page/limit`

### 2.1 Formato estándar de error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {
      "field": "specific_field_error"
    }
  }
}
```

### 2.2 Códigos comunes

- `INVALID_INPUT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMIT_EXCEEDED`
- `VALIDATION_ERROR`
- `PAYMENT_FAILED`
- `CONTENT_VIOLATION`

### 2.3 Objeto de paginación

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 500,
    "pages": 25,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## 3. Authentication

### POST /auth/register
Registra un nuevo usuario.

**Request**
```json
{
  "username": "string (3-30 chars, alphanumeric+_-)",
  "email": "string (valid email)",
  "password": "string (min 8 chars)",
  "display_name": "string (optional)"
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "created_at": "ISO8601"
  },
  "access_token": "jwt_token",
  "refresh_token": "jwt_token",
  "expires_in": 900
}
```

### POST /auth/login
Inicia sesión con email o username.

**Request**
```json
{
  "email_or_username": "string",
  "password": "string"
}
```

**Response 200**
```json
{
  "success": true,
  "access_token": "jwt_token",
  "refresh_token": "jwt_token",
  "expires_in": 900,
  "user": {
    "user_id": "uuid",
    "username": "string",
    "email": "string",
    "avatar_url": "string|null"
  }
}
```

### POST /auth/refresh
Refresca access token.

**Request**
```json
{
  "refresh_token": "string"
}
```

**Response 200**
```json
{
  "success": true,
  "access_token": "new_jwt_token",
  "expires_in": 900
}
```

### POST /auth/logout
Invalida la sesión actual o refresh token activo.

**Response 200**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST /auth/forgot-password
Solicita recuperación de contraseña.

### POST /auth/reset-password
Resetea contraseña con token.

---

## 4. Users

### GET /users/me
Obtiene perfil y estado básico del usuario actual.

**Response 200**
```json
{
  "user_id": "uuid",
  "username": "string",
  "email": "string",
  "display_name": "string",
  "bio": "string|null",
  "avatar_url": "string|null",
  "cover_url": "string|null",
  "website": "string|null",
  "location": "string|null",
  "verification_level": "BASIC|VERIFIED|BUSINESS|ELITE",
  "verified": false,
  "account_type": "PERSONAL|CREATOR|BUSINESS",
  "privacy_level": "PUBLIC|FOLLOWERS|PRIVATE",
  "follower_count": 0,
  "following_count": 0,
  "post_count": 0,
  "created_at": "ISO8601"
}
```

**Nota**
El estado de plan puede resolverse por endpoint de billing o por un resumen derivado, pero no debe tratarse como única fuente de verdad dentro del objeto de usuario.

**Valores de `verification_level`**

| Valor      | Descripción                                                      |
|------------|------------------------------------------------------------------|
| `BASIC`    | Cuenta creada sin verificación adicional                         |
| `VERIFIED` | Identidad o autoría confirmada por CircleSfera                   |
| `BUSINESS` | Cuenta de negocio u organización verificada                      |
| `ELITE`    | Nivel premium para creadores o marcas destacadas                 |

**Nota sobre `verified`**
Campo booleano derivado mantenido como shorthand (`verification_level !== "BASIC"`). El campo canónico es `verification_level`.

---

### GET /users/:username
Obtiene perfil público.

**Response 200**
```json
{
  "user_id": "uuid",
  "username": "string",
  "display_name": "string|null",
  "bio": "string|null",
  "avatar_url": "string|null",
  "cover_url": "string|null",
  "website": "string|null",
  "location": "string|null",
  "verification_level": "BASIC|VERIFIED|BUSINESS|ELITE",
  "verified": false,
  "account_type": "PERSONAL|CREATOR|BUSINESS",
  "follower_count": 0,
  "following_count": 0,
  "post_count": 0,
  "is_following": false,
  "is_blocked": false,
  "created_at": "ISO8601"
}
```

---

### DELETE /users/me [NEW]
Elimina la cuenta del usuario autenticado (Derecho de supresión GDPR). El proceso marca la cuenta para eliminación y oculta el perfil inmediatamente. El borrado físico ocurre tras un periodo de gracia de 30 días.

**Response 200**
```json
{
  "success": true,
  "message": "Account scheduled for deletion",
  "scheduled_deletion_at": "ISO8601 (+30 days)"
}
```

---

### PATCH /users/me
Actualiza perfil del usuario.

**Request**
```json
{
  "display_name": "string (optional)",
  "bio": "string (optional)",
  "website": "string (optional)",
  "location": "string (optional)"
}
```

### GET /users/me/settings [NEW]
Obtiene la configuración de privacidad y notificaciones del usuario.

**Response 200**
```json
{
  "privacy_level": "PUBLIC|FOLLOWERS|PRIVATE",
  "content_preference": "GENERAL|MATURE",
  "blur_sensitive_content": true,
  "email_notifications": true,
  "push_notifications": true,
  "updated_at": "ISO8601"
}
```

### PUT /users/me/settings [UPDATED]
Actualiza la configuración de privacidad, contenido y notificaciones.

**Request**
```json
{
  "privacy_level": "PUBLIC|FOLLOWERS|PRIVATE",
  "content_preference": "GENERAL|MATURE",
  "blur_sensitive_content": true,
  "email_notifications": true,
  "push_notifications": true
}
```

**Response 200**
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": {
    "privacy_level": "PUBLIC",
    "...": "..."
  }
}
```

### GET /users/:username/followers
Lista seguidores.

### GET /users/:username/following
Lista seguidos.

---

## 5. Posts

### POST /posts
Crea un nuevo post.

**Request** `multipart/form-data`
- `content`: string opcional, max 5000
- `content_rating`: `GENERAL|MATURE`
- `location`: string opcional
- `media[]`: files opcionales
- `alt_text[]`: strings opcionales
- `allow_comments`: boolean opcional

**Response 201**
```json
{
  "post_id": "uuid",
  "user_id": "uuid",
  "content": "string|null",
  "content_rating": "GENERAL|MATURE",
  "media": [
    {
      "media_id": "uuid",
      "url": "string",
      "type": "image|video",
      "alt_text": "string|null"
    }
  ],
  "like_count": 0,
  "comment_count": 0,
  "created_at": "ISO8601"
}
```

### GET /posts/:postId
Obtiene un post específico.

**Response 200**
```json
{
  "post_id": "uuid",
  "user": {
    "user_id": "uuid",
    "username": "string",
    "display_name": "string|null",
    "avatar_url": "string|null",
    "verification_level": "BASIC|VERIFIED|BUSINESS|ELITE",
    "verified": false
  },
  "content": "string|null",
  "content_rating": "GENERAL|MATURE",
  "media": [],
  "hashtags": ["tag1", "tag2"],
  "like_count": 0,
  "comment_count": 0,
  "liked_by_me": false,
  "bookmarked_by_me": false,
  "created_at": "ISO8601",
  "edited": false,
  "edited_at": null
}
```

### PATCH /posts/:postId
Actualiza post propio.

### DELETE /posts/:postId
Elimina post propio.

### POST /posts/:postId/like
Da like a un post.

### DELETE /posts/:postId/like
Quita like de un post.

### GET /posts/:postId/comments
Lista comentarios.

**Response 200**
```json
{
  "data": [
    {
      "comment_id": "uuid",
      "user": {
        "user_id": "uuid",
        "username": "string",
        "avatar_url": "string|null"
      },
      "content": "string",
      "parent_comment_id": "uuid|null",
      "created_at": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

### POST /posts/:postId/comment
Crea comentario en un post.

**Request**
```json
{
  "content": "string (max 2000 chars)",
  "parent_comment_id": "uuid|null"
}
```

### GET /conversations
Lista conversaciones del usuario actual.

**Response 200**:
```json
[
  {
    "conversation_id": "uuid",
    "last_message": { "content": "string", "created_at": "ISO8601" },
    "participants": [ { "username": "string", "avatar_url": "string" } ]
  }
]
```

### GET /conversations/:id/messages
Obtiene el historial de mensajes de una conversación.

**Request**: `?limit=50&cursor=uuid`

**Response 200**:
```json
{
  "data": [
    {
      "message_id": "uuid",
      "sender_id": "uuid",
      "content": "string",
      "media_url": "string|null",
      "expires_at": "ISO8601|null",
      "created_at": "ISO8601"
    }
  ]
}
```

### POST /messages [NEW]
Envía un mensaje a una conversación.

**Request**
```json
{
  "conversation_id": "uuid",
  "content": "string",
  "media_url": "string (optional)",
  "expires_at": "ISO8601 (optional, for ephemeral messages)"
}
```

### DELETE /messages/:id
Elimina un mensaje (solo remitente).

**Response 204**: No Content

### POST /posts/:postId/bookmark
Guarda post.

### DELETE /posts/:postId/bookmark
Quita bookmark.

---

## 6. Feed

### GET /feed
Obtiene feed cronológico del usuario autenticado.

**Request**
`GET /feed?limit=20&page=1&content_filter=GENERAL`

**Response 200**
```json
{
  "data": ["post_objects"],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 200,
    "pages": 10,
    "has_next": true,
    "has_prev": false
  }
}
```

**Nota**
El feed combina posts y stories de usuarios seguidos. Se puede filtrar por `content_filter` para respetar las preferencias de sensibilidad del usuario.

---

## 7. Social

### POST /users/:userId/follow
Sigue a un usuario o crea solicitud si el perfil es privado.

**Response 200**
```json
{
  "success": true,
  "status": "ACTIVE|PENDING",
  "follower_count": 150
}
```

### DELETE /users/:userId/follow
Deja de seguir a un usuario.

### POST /users/:userId/block
Bloquea a un usuario.

### DELETE /users/:userId/block
Desbloquea a un usuario.

**Nota**
Se elimina `POST /users/:userId/mute` del documento oficial del MVP porque el PRD lo menciona como capacidad funcional, pero en la línea técnica corregida no aparece consolidado como entidad formal y conviene no fijarlo como contrato API hasta cerrar su soporte real.

---

## 8. Moderation

### POST /reports
Reporta un post, comentario, usuario, story o mensaje.

**Request**
```json
{
  "reportable_type": "POST|COMMENT|USER|STORY|MESSAGE",
  "reportable_id": "uuid",
  "reason": "SPAM|HARASSMENT|ILLEGAL_CONTENT|VIOLENCE|HATE_SPEECH|IMPERSONATION|CSAM|OTHER",
  "description": "string (optional, max 1000 chars)"
}
```

**Tipos válidos de `reportable_type`**

| Valor     | Descripción                                         |
|-----------|-----------------------------------------------------|
| `POST`    | Post o frame publicado                              |
| `COMMENT` | Comentario en un post                               |
| `USER`    | Cuenta o perfil de usuario                          |
| `STORY`   | Story (incluyendo stories en highlights)            |
| `MESSAGE` | Mensaje en conversación (requiere ser participante) |

**Razones válidas de `reason`**

| Valor             | Descripción                           |
|-------------------|---------------------------------------|
| `SPAM`            | Spam o actividad automatizada abusiva |
| `HARASSMENT`      | Acoso directo o amenazas              |
| `ILLEGAL_CONTENT` | Contenido ilegal (incluye CSAM)       |
| `VIOLENCE`        | Violencia extrema o glorificación     |
| `HATE_SPEECH`     | Discurso de odio punible              |
| `IMPERSONATION`   | Suplantación de identidad             |
| `CSAM`            | Explotación sexual infantil           |
| `OTHER`           | Otro (requiere `description`)         |

**Response 201**
```json
{
  "report_id": "uuid",
  "status": "PENDING",
  "message": "Report submitted. Thank you for helping us keep CircleSfera safe."
}
```

**Reglas de negocio**
- `reportable_type: "MESSAGE"` solo puede usarlo un participante activo de la conversación.
- `reportable_type: "STORY"` es válido aunque la story haya expirado; el reporte debe poder abrirse mientras exista el registro en base de datos.
- `reason: "OTHER"` requiere `description` no vacío (mínimo 20 chars).
- **Nota sobre contenido:** `STORY` y `MESSAGE` son reportables aunque no dispongan de endpoints de publicación documentados en esta versión del MVP.

---

### GET /reports/me
Lista reports enviados por el usuario autenticado.

**Response 200**
```json
{
  "data": [
    {
      "report_id": "uuid",
      "reportable_type": "POST|COMMENT|USER|STORY|MESSAGE",
      "reportable_id": "uuid",
      "reason": "HARASSMENT",
      "status": "PENDING|REVIEWING|RESOLVED|REJECTED",
      "resolved_at": "ISO8601|null",
      "created_at": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

**Nota**
Los endpoints `POST /appeals/:actionId` y `GET /moderation/my-actions` permanecen fuera del contrato oficial del MVP al no estar respaldados por entidades persistidas en el schema actual. El campo `resolved_at` se deriva de `updatedAt` cuando el status cambia a `resolved` o `rejected`; no requiere columna adicional en base de datos.

---

## 9. Notifications

### GET /notifications
Lista notificaciones del usuario.

**Request**
`GET /notifications?limit=20&page=1`

**Response 200**
```json
{
  "data": [
    {
      "notification_id": "uuid",
      "type": "LIKE|COMMENT|FOLLOW|MODERATION|SUBSCRIPTION",
      "target_type": "post|story|comment|message|report",
      "target_id": "uuid",
      "read": false,
      "created_at": "ISO8601",
      "actor": {
        "user_id": "uuid",
        "username": "string",
        "avatar_url": "string|null"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 10,
    "pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

### POST /notifications/:notificationId/read
Marca una notificación como leída.

### POST /notifications/read-all
Marca todas como leídas.

---

## 10. Billing

### GET /billing/plans
Lista planes disponibles con sus beneficios estructurados.

**Response 200**
```json
{
  "data": [
    {
      "plan_id": "uuid",
      "name": "premium",
      "description": "string",
      "monthly_price": 4.99,
      "yearly_price": 49.99,
      "currency": "EUR",
      "features": [
        { "key": "verified_badge", "label": "Verified badge", "enabled": true, "limit": null },
        { "key": "analytics_basic", "label": "Basic analytics", "enabled": true, "limit": null },
        { "key": "promotions_enabled", "label": "Promotions", "enabled": true, "limit": null },
        { "key": "priority_support", "label": "Priority support", "enabled": true, "limit": null }
      ]
    }
  ]
}
```

**Feature keys válidos**

| Key                  | Descripción                                     |
|----------------------|-------------------------------------------------|
| `verified_badge`     | Badge de verificación visible en perfil         |
| `analytics_basic`    | Analytics básicas de posts y perfil             |
| `priority_support`   | Soporte prioritario                             |
| `promotions_enabled` | Acceso a lanzar promotions                      |
| `extended_storage`   | Almacenamiento extendido para media             |
| `hide_ads`           | Sin publicidad en feed (si aplica en el futuro) |
| `early_access`       | Acceso anticipado a nuevas funciones            |

---

### POST /billing/subscribe
Inicia suscripción a un plan. Si el usuario ya tiene una suscripción activa, el sistema la cancela al final del periodo actual antes de crear la nueva.

**Request**
```json
{
  "plan_id": "uuid",
  "billing_cycle": "MONTHLY|YEARLY"
}
```

**Response 200**
```json
{
  "success": true,
  "checkout_session_id": "string",
  "checkout_url": "string",
  "previous_plan_cancel_at_period_end": true
}
```

**Errores específicos**
- `PLAN_NOT_FOUND` (404): el plan no existe o no está activo.
- `ALREADY_ON_PLAN` (409): el usuario ya está suscrito a este plan exacto.
- `PAYMENT_FAILED` (402): error al crear sesión de checkout en Stripe.

---

### GET /billing/subscription
Obtiene la suscripción activa del usuario. Retorna objeto con `active: false` si no existe ninguna activa.

**Response 200 — con suscripción activa**
```json
{
  "active": true,
  "plan": {
    "plan_id": "uuid",
    "name": "premium",
    "billing_cycle": "MONTHLY|YEARLY"
  },
  "status": "ACTIVE|TRIALING|PAST_DUE|INCOMPLETE|CANCELLED|EXPIRED",
  "current_period_start": "ISO8601",
  "current_period_end": "ISO8601",
  "cancel_at_period_end": false
}
```

**Response 200 — sin suscripción activa**
```json
{
  "active": false,
  "plan": null,
  "status": null
}
```

**Nota de diseño**
Este endpoint retorna siempre un objeto único porque el contrato de producto garantiza máximo 1 plan activo simultáneo. La lógica de aplicación aplica esta restricción antes de crear nuevas suscripciones.

---

### POST /billing/cancel
Solicita cancelación de suscripción al final del periodo activo.

### GET /billing/history
Lista historial de pagos y eventos facturables.

---

## 11. Analytics

### GET /analytics/me
Devuelve métricas básicas del usuario. Las métricas son calculadas en tiempo real a partir de la actividad actual (likes, views, comments).

**Request**
`GET /analytics/me?time_range=DAY|WEEK|MONTH`

**Response 200**
```json
{
  "profile_views": 1250,
  "follower_growth": 45,
  "total_engagements": 3420,
  "top_posts": [
    {
      "post_id": "uuid",
      "impressions": 5000,
      "engagement_rate": 0.18
    }
  ]
}
```

### GET /analytics/posts/:postId
Analytics básicas de un post.

**Response 200**
```json
{
  "post_id": "uuid",
  "impressions": 5000,
  "reach": 3200,
  "views": 2800,
  "likes": 450,
  "comments": 85,
  "saves": 200,
  "engagement_rate": 0.18
}
```

**Nota**
Se eliminan referencias a analytics de `frame` y a demografía avanzada no respaldada como capacidad base del MVP corregido.

---

## 12. Stories [NEW]

### POST /stories
Sube una story efímera (24h).

**Request (Multipart/Form-Data)**:
- `file`: Imagen o Video.
- `is_close_friends_only`: Boolean (optional).
- `audio_id`: uuid (optional).

**Response 201**:
```json
{
  "story_id": "uuid",
  "media_url": "string",
  "expires_at": "ISO8601",
  "is_close_friends_only": false
}
```

### GET /stories
Lista stories activas de usuarios seguidos.

**Response 200**:
```json
[
  {
    "user": { "user_id": "uuid", "username": "string", "avatar_url": "string" },
    "stories": [
      { "story_id": "uuid", "media_url": "string", "expires_at": "ISO8601" }
    ]
  }
]
```

### GET /stories/user/:username
Lista stories activas de un usuario específico.

**Response 200**:
```json
{
  "user_id": "uuid",
  "stories": [
    { "story_id": "uuid", "media_url": "string", "created_at": "ISO8601" }
  ]
}
```

---

## 13. Promotions [NEW]

### POST /promotions
Crea una promoción para un post o story. El cobro se realiza de forma inmediata.

**Request**: `target_id`, `target_type (POST|STORY)`, `budget`, `duration_days`.

**Response 201**:
```json
{
  "promotion_id": "uuid",
  "status": "ACTIVE",
  "stripe_payment_intent_id": "pi_..."
}
```

**Errores específicos**:
- `PAYMENT_DECLINED`: El cargo en Stripe fue rechazado.
- `TARGET_NOT_FOUND`: El post o story no existe.

### GET /promotions/me
Lista promociones propias y su estado (`PENDING|ACTIVE|COMPLETED|REJECTED`).

---

## 13. Promotions

### GET /promotions/plans
Consulta qué tipos de contenido son promocionables y los parámetros de presupuesto.

**Response 200**
```json
{
  "data": [
    {
      "target_type": "POST|STORY|PROFILE",
      "min_budget": 5.00,
      "max_budget": 500.00,
      "currency": "EUR",
      "min_duration_days": 1,
      "max_duration_days": 30
    }
  ]
}
```

---

### POST /promotions
Lanza una promotion sobre un post, story o perfil.

**Requisito:** usuario con suscripción activa en plan que habilite `promotions_enabled`, o según regla de negocio documentada en PRD sección 6.7.

**Request**
```json
{
  "target_type": "POST|STORY|PROFILE",
  "target_id": "uuid",
  "budget": 20.00,
  "currency": "EUR",
  "start_date": "ISO8601",
  "end_date": "ISO8601"
}
```

**Response 201**
```json
{
  "promotion_id": "uuid",
  "target_type": "POST|STORY|PROFILE",
  "target_id": "uuid",
  "budget": 20.00,
  "currency": "EUR",
  "status": "PENDING|ACTIVE|COMPLETED|REJECTED|CANCELLED",
  "start_date": "ISO8601",
  "end_date": "ISO8601",
  "reach": 0,
  "created_at": "ISO8601"
}
```

**Errores específicos**
- `TARGET_NOT_FOUND` (404): el target_id no existe o no pertenece al usuario.
- `INVALID_BUDGET` (400): presupuesto fuera del rango permitido.
- `INVALID_DATE_RANGE` (400): fechas inválidas o start_date en el pasado.
- `PROMOTION_NOT_ELIGIBLE` (403): el contenido no es elegible para promotion (privado, suspendido, etc.).

---

### GET /promotions/me
Lista promotions del usuario autenticado.

**Request**
`GET /promotions/me?status=ACTIVE&limit=20&page=1`

**Response 200**
```json
{
  "data": [
    {
      "promotion_id": "uuid",
      "target_type": "POST|STORY|PROFILE",
      "target_id": "uuid",
      "budget": 20.00,
      "currency": "EUR",
      "status": "PENDING|ACTIVE|COMPLETED|REJECTED|CANCELLED",
      "start_date": "ISO8601",
      "end_date": "ISO8601",
      "reach": 1240,
      "created_at": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

---

### GET /promotions/:promotionId
Detalle de una promotion propia.

---

### DELETE /promotions/:promotionId
Cancela una promotion activa o pendiente.

**Response 200**
```json
{
  "success": true,
  "promotion_id": "uuid",
  "status": "CANCELLED",
  "refund_policy": "PROPORTIONAL|NONE"
}
```

**Nota sobre cobro**
El flujo de cobro de promotions debe cerrarse como decisión de producto antes de exponer este endpoint en producción: ¿cargo inmediato por Stripe al crear la promotion? ¿crédito de plataforma? ¿facturación al finalizar? Esta decisión afecta el campo `budget`, los estados posibles y el campo `refund_policy`. Documentar en PRD sección 6.7 antes del primer despliegue de promotions en producción.

---

## 14. Search History

### GET /search-history
Lista el historial de búsqueda del usuario autenticado.

**Request**
`GET /search-history?limit=20&page=1`

**Response 200**
```json
{
  "data": [
    {
      "search_id": "uuid",
      "query": "string",
      "created_at": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

---

### DELETE /search-history/:searchId
Elimina una entrada específica del historial.

**Response 200**
```json
{ "success": true }
```

---

### DELETE /search-history
Elimina todo el historial de búsqueda del usuario (derecho de supresión GDPR).

**Response 200**
```json
{
  "success": true,
  "deleted_count": 15
}
```

**Nota GDPR**
Este endpoint satisface el derecho de supresión sobre datos de comportamiento del usuario. Debe estar accesible desde ajustes de privacidad en la UI. La retención máxima de `search_history` es de 90 días; un job periódico purga automáticamente entradas anteriores a esa ventana.