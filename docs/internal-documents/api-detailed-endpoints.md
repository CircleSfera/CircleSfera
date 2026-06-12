API Detailed Specification
CircleSfera REST API
Base URL: `https://api.circlesfera.com/v1`  
Authentication: JWT Bearer Token (`Authorization: Bearer <token>`)  
Rate Limit: 100 requests/minute per user  
Response Format: JSON (UTF-8)  
Content-Type: `application/json`  
File Uploads: `multipart/form-data`

Authentication Endpoints

POST /auth/register
Registra un nuevo usuario
Request:

{
"username": "string (3-30 chars, alphanumeric+\_-)",
"email": "string (valid email)",
"password": "string (min 8 chars, 1 uppercase, 1 number)",
"display_name": "string (optional)",
"birthday": "YYYY-MM-DD (min 13 years old)"
}

Response: 201 Created

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

Error Responses:

400: INVALID_INPUT - Username already taken / Invalid email format / Password too weak
409: CONFLICT - Email already registered
422: VALIDATION_ERROR - Age under 13 years

POST /auth/login
Inicia sesión con credenciales
Request:

{
"email_or_username": "string",
"password": "string",
"remember_me": "boolean (optional, default false)"
}

Response: 200 OK

{
"success": true,
"access_token": "jwt_token",
"refresh_token": "jwt_token",
"expires_in": 900,
"user": {
"user_id": "uuid",
"username": "string",
"email": "string",
"avatar_url": "string|null",
"plan_type": "free|premium|business|elite_creator"
}
}

Error Responses:

401: UNAUTHORIZED - Invalid credentials
429: RATE_LIMIT_EXCEEDED - Too many login attempts (wait 15 minutes)

POST /auth/refresh
Refresca access token usando refresh token
Request:

{
"refresh_token": "string"
}

Response: 200 OK

{
"success": true,
"access_token": "new_jwt_token",
"expires_in": 900
}
POST /auth/logout
Invalida todos los tokens del usuario actual
Request: (requires auth)

{}

Response: 200 OK

{
"success": true,
"message": "Logged out successfully"
}

POST /auth/forgot-password
Solicita reset de contraseña
Request:

{
"email": "string"
}

Response: 200 OK

{
"success": true,
"message": "Check your email for reset instructions"
}

POST /auth/reset-password
Resetea contraseña con token
Request:

{
"token": "string (from email)",
"password": "string (new password)"
}

Response: 200 OK

{
"success": true,
"message": "Password reset successfully"
}

2. Users Endpoints

GET /users/me
Obtiene perfil completo del usuario actual
Request: (requires auth)

Response: 200 OK

{
"user_id": "uuid",
"username": "string",
"email": "string",
"display_name": "string",
"bio": "string|max 500 chars",
"avatar_url": "string|null",
"cover_url": "string|null",
"website": "string|null",
"location": "string|null",
"plan_type": "free|premium|business|elite_creator",
"verified": "boolean",
"follower_count": "number",
"following_count": "number",
"post_count": "number",
"frames_count": "number",
"created_at": "ISO8601"
}

GET /users/:username
Obtiene perfil público de usuario

Request:

GET /users/luisfeliu

Response: 200 OK

{
"user_id": "uuid",
"username": "string",
"display_name": "string",
"bio": "string",
"avatar_url": "string|null",
"cover_url": "string|null",
"verified": "boolean",
"plan_type": "free|premium|business|elite_creator",
"verification_badge": "blue|gray|yellow|null",
"follower_count": "number",
"following_count": "number",
"post_count": "number",
"is_following": "boolean",
"is_follower": "boolean",
"is_blocked": "boolean",
"created_at": "ISO8601"
}

PATCH /users/me
Actualiza perfil del usuario

Request: (requires auth)

{
"display_name": "string (optional)",
"bio": "string (max 500 chars, optional)",
"website": "string (valid URL, optional)",
"location": "string (optional)",
"avatar": "file (optional)",
"cover": "file (optional)"
}

Response: 200 OK

{
"success": true,
"user": { user_object }
}

PUT /users/me/settings
Actualiza configuración de usuario

Request: (requires auth)

{
"privacy_level": "public|followers|private",
"content_preference": "general|mature",
"blur_sensitive_content": "boolean",
"allow_messages_from": "everyone|followers|none",
"email_notifications": "boolean",
"push_notifications": "boolean"
}

Response: 200 OK

{
"success": true,
"settings": { settings_object }
}
GET /users/:username/followers
Lista seguidores de usuario

Request:

GET /users/luisfeliu/followers?limit=20&page=1

Response: 200 OK

{
"data": [user_objects],
"pagination": {
"page": 1,
"limit": 20,
"total": 150,
"pages": 8
}
}

GET /users/:username/following
Lista usuarios a los que sigue

Request:

GET /users/luisfeliu/following?limit=20&page=1

3. Posts Endpoints

POST /posts
Crea un nuevo post

Request: (multipart/form-data, requires auth)

Form fields:

- content: string (max 5000 chars)
- content_rating: general|mature
- location: string (optional)
- media[]: files (optional, max 10 files, 50MB each)
- alt_text[]: strings (optional, one per image)

Response: 201 Created

{
"post_id": "uuid",
"user_id": "uuid",
"content": "string",
"content_rating": "general|mature",
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
"share_count": 0,
"created_at": "ISO8601"
}

GET /posts/:postId
Obtiene un post específico

Request:

GET /posts/550e8400-e29b-41d4-a716-446655440000

Response: 200 OK

{
"post_id": "uuid",
"user": { user_object },
"content": "string",
"content_rating": "general|mature",
"media": [media_objects],
"hashtags": ["#tag1", "#tag2"],
"like_count": "number",
"comment_count": "number",
"share_count": "number",
"liked_by_me": "boolean",
"bookmarked_by_me": "boolean",
"created_at": "ISO8601",
"edited": "boolean",
"edited_at": "ISO8601|null"
}

PATCH /posts/:postId
Actualiza un post (solo autor)

Request: (requires auth)

{
"content": "string (optional)"
}

Response: 200 OK

{
"success": true,
"post": { post_object }
}

DELETE /posts/:postId
Elimina un post (solo autor)

Request: (requires auth)

Response: 204 No Content

POST /posts/:postId/like
Dale like a un post

Request: (requires auth)

Response: 200 OK

{
"success": true,
"like_count": 42
}

DELETE /posts/:postId/like
Quita like de un post

Request: (requires auth)

Response: 200 OK

{
"success": true,
"like_count": 41
}
GET /posts/:postId/comments
Obtiene comentarios de un post

Request:

GET /posts/:postId/comments?limit=20&page=1&sort=newest|popular

Response: 200 OK

{
"data": [
{
"comment_id": "uuid",
"user": { user_object },
"content": "string",
"parent_comment_id": "uuid|null",
"like_count": "number",
"liked_by_me": "boolean",
"created_at": "ISO8601"
}
],
"pagination": { pagination_object }
}

POST /posts/:postId/comment
Comenta en un post

Request: (requires auth)

{
"content": "string (max 2000 chars)",
"parent_comment_id": "uuid (optional, for threading)"
}

Response: 201 Created

{
"comment_id": "uuid",
"user": { user_object },
"content": "string",
"like_count": 0,
"created_at": "ISO8601"
}

POST /posts/:postId/bookmark
Guarda un post en bookmarks

Request: (requires auth)

Response: 200 OK

{
"success": true,
"bookmarked": true
}

DELETE /posts/:postId/bookmark
Quita post de bookmarks

Request: (requires auth)

Response: 200 OK

{
"success": true,
"bookmarked": false
}

4. Feed Endpoints

GET /feed
Obtiene feed personalizado del usuario

Request: (requires auth)

GET /feed?algorithm=personalized&limit=20&offset=0&content_filter=general

Query Parameters:

• `algorithm`: chronological|personalized|popular (default: personalized)
• `limit`: 1-100 (default: 20)
• `offset`: pagination offset (default: 0)
• `content_filter`: general|mature (default: user settings)

Response: 200 OK

{
"data": [post_objects],
"pagination": {
"limit": 20,
"offset": 0,
"total": 5234
}
}

GET /feed/explore
Descubre contenido nuevo

Request:

GET /feed/explore?limit=20&offset=0&category=all|art|music|tech|politics

Response: 200 OK

{
"data": [post_objects],
"pagination": { pagination_object }
}

GET /feed/trending
Obtiene posts trending

Request:

GET /feed/trending?time_range=day|week|month&limit=20

Response: 200 OK

5. Stories Endpoints

POST /stories
Crea una story

Request: (multipart/form-data, requires auth)

Form fields:

- media: file (image or video, max 60s)
- content_rating: general|mature

Response: 201 Created

{
"story_id": "uuid",
"user_id": "uuid",
"media_url": "string",
"content_rating": "general|mature",
"expires_at": "ISO8601",
"created_at": "ISO8601"
}

GET /stories
Obtiene stories de usuarios seguidos

Request: (requires auth)

GET /stories?limit=50

Response: 200 OK

{
"data": [
{
"user": { user_object },
"stories": [story_objects],
"has_viewed": "boolean"
}
]
}

POST /stories/:storyId/view
Marca story como vista

Request: (requires auth)

Response: 200 OK

{
"success": true
}

DELETE /stories/:storyId
Elimina una story (solo autor)

Request: (requires auth)

Response: 204 No Content

6. Frames Endpoints

POST /frames
Crea un frame (video corto)

Request: (multipart/form-data, requires auth)

Form fields:

- video: file (15-60s, max 100MB)
- caption: string (optional)
- content_rating: general|mature
- thumbnail: file (optional)

Response: 201 Created

{
"frame_id": "uuid",
"user_id": "uuid",
"video_url": "string",
"thumbnail_url": "string|null",
"caption": "string|null",
"content_rating": "general|mature",
"like_count": 0,
"created_at": "ISO8601"
}

GET /frames
Obtiene frames recomendados

Request:

GET /frames?algorithm=for_you&limit=20&offset=0

Response: 200 OK

{
"data": [frame_objects],
"pagination": { pagination_object }
}

POST /frames/:frameId/like

Dale like a un frame

Request: (requires auth)

Response: 200 OK

{
"success": true,
"like_count": 42
}

7. Social Endpoints

POST /users/:userId/follow

Sigue a un usuario

Request: (requires auth)

Response: 200 OK

{
"success": true,
"following": true,
"follower_count": 150
}

DELETE /users/:userId/follow

Deja de seguir a un usuario
Request: (requires auth)
Response: 200 OK

{
"success": true,
"following": false,
"follower_count": 149
}

POST /users/:userId/block

Bloquea a un usuario

Request: (requires auth)

Response: 200 OK

{
"success": true,
"blocked": true
}

DELETE /users/:userId/block

Desbloquea a un usuario

Request: (requires auth)

Response: 200 OK

{
"success": true,
"blocked": false
}

POST /users/:userId/mute

Silencia a un usuario (no notificaciones)

Request: (requires auth)

Response: 200 OK

{
"success": true,
"muted": true
}

8. Moderation Endpoints

POST /reports
Reporta contenido o usuario

Request: (requires auth)

{
"reportable_type": "post|comment|user|frame|story",
"reportable_id": "uuid",
"reason": "spam|harassment|illegal_content|violence|hate_speech|impersonation",
"description": "string (optional, max 1000 chars)"
}

Response: 201 Created

{
"report_id": "uuid",
"status": "pending",
"message": "Report submitted. Thank you for helping us keep CircleSfera safe."
}

POST /appeals/:actionId
Apela una acción de moderación

Request: (requires auth)

{
"reason": "string (500-2000 chars)",
"evidence": "string (optional)"
}

Response: 201 Created

{
"appeal_id": "uuid",
"status": "pending",
"message": "Appeal submitted. We'll review within 72 hours."
}

GET /moderation/my-actions
Obtiene historial de acciones de moderación del usuario

Request: (requires auth)

GET /moderation/my-actions?limit=50&page=1

Response: 200 OK

{
"data": [
{
"action_id": "uuid",
"action_type": "remove_content|restrict|warn|suspend|ban_user",
"target_type": "post|comment|user|frame|story",
"target_id": "uuid",
"reason": "Article X of Spanish Criminal Code / Platform Policy Section Y",
"created_at": "ISO8601",
"can_appeal": "boolean",
"appeal_status": "pending|approved|rejected|null"
}
],
"pagination": { pagination_object }
}

9. Monetization Endpoints

GET /billing/plans
Lista planes disponibles

Request:

GET /billing/plans?currency=EUR&billing_cycle=monthly

Response: 200 OK

{
"data": [
{
"plan_id": "uuid",
"name": "premium",
"monthly_price": 4.99,
"yearly_price": 49.99,
"currency": "EUR",
"features": [
"No ads",
"Advanced analytics",
"Priority support"
]
}
]
}

POST /billing/subscribe
Inicia suscripción a plan

Request: (requires auth)

{
"plan_id": "uuid",
"billing_cycle": "monthly|yearly"
}

Response: 200 OK

{
"success": true,
"client_secret": "stripe_client_secret",
"redirect_url": "string (3DS if needed)"
}

GET /billing/subscription
Obtiene estado de suscripción actual
Request: (requires auth)

Response: 200 OK

{
"active": "boolean",
"plan": { plan_object },
"status": "active|cancelled|past_due|trialing",
"current_period_start": "ISO8601",
"current_period_end": "ISO8601",
"next_billing_date": "ISO8601|null",
"cancel_at_period_end": "boolean"
}

POST /billing/cancel
Cancela suscripción
Request: (requires auth)

Response: 200 OK

{
"success": true,
"cancelled_at": "ISO8601",
"message": "Subscription cancelled. Access until end of billing period."
}

GET /billing/history
Historial de facturación

Request: (requires auth)

GET /billing/history?limit=20&page=1

Response: 200 OK

{
"data": [
{
"transaction_id": "uuid",
"type": "subscription|renewal|upgrade",
"amount": 4.99,
"currency": "EUR",
"status": "completed|failed|refunded",
"created_at": "ISO8601"
}
],
"pagination": { pagination_object }
}

10. Analytics Endpoints

GET /analytics/me
Analytics del usuario actual (premium+)

Request: (requires auth)

GET /analytics/me?time_range=day|week|month|year

Response: 200 OK

{
"profile_views": 1250,
"follower_growth": 45,
"total_engagements": 3420,
"top_content": [
{
"content_id": "uuid",
"type": "post|frame",
"impressions": 5000,
"engagement_rate": 0.18
}
],
"audience": {
"age_ranges": { "13-17": 10, "18-25": 40, "26-35": 35, "36+": 15 },
"countries": { "ES": 60, "US": 20, "MX": 10, "other": 10 }
},
"best_times": ["10:00", "18:00", "21:00"]
}

GET /analytics/content/:contentId
Analytics de contenido específico (premium+)
Request: (requires auth)

Response: 200 OK

{
"content_id": "uuid",
"type": "post|frame",
"impressions": 5000,
"reach": 3200,
"views": 2800,
"likes": 450,
"comments": 85,
"shares": 120,
"saves": 200,
"engagement_rate": 0.18,
"demographics": { demographics_object }
}

Error Handling
Error Response Format

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

Common Error Codes

INVALID_INPUT: Validación fallida
UNAUTHORIZED: No autenticado
FORBIDDEN: Sin permisos
NOT_FOUND: Recurso no existe
CONFLICT: Conflicto (ej: username taken)
RATE_LIMIT_EXCEEDED: Demasiadas requests
VALIDATION_ERROR: Datos inválidos
PAYMENT_FAILED: Error en pago
CONTENT_VIOLATION: Contenido viola políticas

Rate Limits:

Authenticated users: 100 requests/minute
Anonymous users: 10 requests/minute
Login endpoint: 5 attempts/15 minutes
File uploads: 100 MB/hour per user
Moderation reports: 5/hour per user
Follow actions: 50/hour per user

Pagination:

{
"data": [],
"pagination": {
"page": 1,
"limit": 20,
"total": 500,
"pages": 25,
"has_next": true,
"has_prev": false,
"next_offset": 20,
"prev_offset": null
}
}

Query Parameters:

limit: 1-100 (default: 20)
page: page number (default: 1)
offset: pagination offset (alternative to page)

Versioning & Headers:

X-API-Version: 1.0
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1698765432
