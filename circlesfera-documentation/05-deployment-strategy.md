# 05-Deployment-Strategy
## CircleSfera
**Versión:** 3.0 alineada al proyecto real  
**Fecha:** Abril 2026  
**Fuente de verdad:** stack real del proyecto + capacidades del schema actual

---

## 1. Objetivo

Este documento sustituye la estrategia de despliegue anterior para alinearla con la arquitectura real de CircleSfera. La corrección principal es operativa: la estrategia ya no puede asumir un backend MVP pequeño sin stories, chat o promociones, y tampoco puede seguir mezclando Prisma con instrucciones de migración de TypeORM.

CircleSfera requiere una infraestructura preparada para una app social con media, feeds, stories, chat, billing con Stripe, notificaciones, búsqueda y soporte futuro para embeddings con pgvector.

---

## 2. Arquitectura objetivo

### 2.1 Capas
- Cloudflare para DNS, CDN, WAF y protección DDoS.
- Frontend web desplegado en hosting estático/CDN.
- Backend NestJS desplegado en contenedores.
- PostgreSQL gestionado como base de datos principal.
- Redis para cache, colas y operaciones efímeras.
- Object storage compatible S3/R2 para media.
- Stripe como proveedor de billing.
- Proveedor transaccional de email.

### 2.2 Recomendación de despliegue

Para CircleSfera conviene una estrategia simple y reversible:

- **Frontend**: Cloudflare Pages o S3 + CloudFront.
- **Backend**: ECS Fargate o Render/Fly/railway-like solo si buscas velocidad temprana; para producción seria, mejor ECS Fargate o EC2 con Docker.
- **PostgreSQL**: RDS PostgreSQL o Neon/Supabase en etapa muy temprana; para producción con más control, RDS.
- **Redis**: ElastiCache Redis.
- **Media**: Cloudflare R2 o S3.

La opción más equilibrada para CircleSfera hoy es **Cloudflare + ECS Fargate + RDS PostgreSQL + ElastiCache + R2/S3**, porque reduce carga operativa respecto a Kubernetes y evita dependencia de un stack demasiado artesanal.

---

## 3. Regiones y residencia de datos

### 3.1 Regiones recomendadas
- Primaria: UE, preferiblemente `eu-west-1` o `eu-central-1`.
- Secundaria futura: otra región UE para DR.
- Evitar usar región EEUU como primaria si tu foco regulatorio y de residencia es UE.

### 3.2 Regla de residencia

Si CircleSfera procesa datos de usuarios europeos y quiere una postura fuerte de cumplimiento, los datos primarios de usuarios, perfiles, mensajes, reports y billing metadata deben residir en la UE. Esto afecta a base de datos, backups, logs y proveedores de email o analítica. Esta parte toca cumplimiento y debe validarse legalmente con DPA y flujos reales de transferencia internacional.

---

## 4. Entornos

### Development
- Docker Compose local.
- PostgreSQL local.
- Redis local.
- Bucket/localstack opcional o mocks.
- Stripe test mode.

### Staging
- Infra casi idéntica a producción.
- Base de datos separada.
- Stripe test keys.
- Webhooks y email en sandbox.
- Datos sintéticos o anonimizados.

### Production
- Alta disponibilidad básica.
- Observabilidad completa.
- Secret management centralizado.
- Backups automatizados.
- Runbooks operativos.

---

## 5. Backend deployment

### 5.1 Empaquetado

El backend NestJS debe desplegarse como contenedor Docker. No debe depender de despliegues manuales sobre servidores sin pipeline repetible.

### 5.2 Estrategia de runtime

- 2 tareas mínimas en producción para evitar punto único de fallo.
- Auto-scaling horizontal por CPU, memoria y latencia, pero con límites iniciales conservadores.
- Tareas separadas para workers/colas si procesas media, expiración de stories, notificaciones o jobs de embeddings.

### 5.3 Workers recomendados

Separar estos jobs del API principal:

- Procesado de imágenes y thumbnails.
- Procesado de video.
- Expiración y limpieza de stories.
- Envío de emails.
- Procesado de webhooks Stripe.
- Reintentos de notificaciones.
- Generación de embeddings si se activa.

---

## 6. Base de datos

### 6.1 Motor y extensiones
- PostgreSQL gestionado.
- Extensión `pgvector` habilitada por `PostEmbedding`.

### 6.2 Migraciones

La estrategia anterior mencionaba TypeORM. Eso queda corregido: CircleSfera usa Prisma, por lo que las migraciones deben ejecutarse con Prisma Migrate.

**Comandos de referencia**
```bash
npx prisma migrate deploy
npx prisma generate
```

### 6.3 Reglas de despliegue de migraciones
- Nunca generar migraciones en producción.
- Las migraciones se generan en desarrollo y se revisan en PR.
- En staging se prueban antes de producción.
- Toda migración destructiva requiere plan de rollback o migración expand-contract.

### 6.4 Backups
- Snapshots automáticos diarios.
- PITR activado.
- Pruebas regulares de restore.
- Retención ajustada a riesgo y coste.

---

## 7. Redis y colas

Redis no debe verse solo como cache. En CircleSfera también tiene sentido para:

- Rate limiting.
- Jobs y colas.
- Presence/transient online state.
- Invalidación de sesiones o tokens revocados.
- Cache de feed y perfiles calientes.

Si el volumen sube, separar cache de cola puede ser razonable, pero no es obligatorio al inicio.

---

## 8. Media pipeline

### 8.1 Necesidades reales del producto
CircleSfera ya modela posts con media, stories, chat con media, avatares y miniaturas. La estrategia de media no puede ser un anexo menor.

### 8.2 Pipeline recomendado
1. Upload inicial a bucket privado o URL firmada.
2. Validación MIME real y tamaño.
3. Escaneo antivirus.
4. Moderación automatizada básica.
5. Generación de variantes (`standard`, `thumbnail`).
6. Persistencia de metadatos en PostgreSQL.
7. Entrega mediante CDN con URLs firmadas o controladas según caso.

### 8.3 Tradeoffs
- **Bucket privado + signed URLs**: mejor control, más complejidad.
- **Bucket público con paths difíciles**: peor seguridad, menos complejidad.

Para CircleSfera, por contenido social y mensajes, conviene **bucket privado + firma controlada**.

---

## 9. CI/CD

### 9.1 Pipeline recomendado
- Lint.
- Tests unitarios.
- Tests de integración.
- `prisma validate`.
- `prisma generate`.
- Build de backend y frontend.
- Build de imagen Docker.
- Scan de dependencias e imagen.
- Deploy a staging.
- Smoke tests.
- Aprobación manual para producción.
- Deploy producción.

### 9.2 Branching
- `main`: producción.
- `develop`: integración.
- `feature/*`: trabajo en curso.
- `hotfix/*`: correcciones urgentes.

### 9.3 Política de rollout
- Blue/green o rolling deployment con health checks.
- Rollback rápido si fallan smoke tests o métricas clave.

---

## 10. Secrets y configuración

### 10.1 Secret management
Usar un gestor centralizado, como AWS Secrets Manager o SSM Parameter Store.

### 10.2 Secretos críticos
- `DATABASE_URL`
- JWT secrets
- Stripe secret key
- Stripe webhook secret
- Email API keys
- Redis credentials
- Bucket credentials
- Encryption keys adicionales si aplican

### 10.3 Regla operativa
- Nunca secretos en git.
- Nunca secretos en variables de frontend.
- Rotación programada para claves sensibles.

---

## 11. Observabilidad

### 11.1 Logs
- Logs JSON estructurados.
- Correlation/request ID por request.
- Separación entre app logs y audit/security logs.

### 11.2 Métricas mínimas
- Latencia API p50/p95/p99.
- Error rate por endpoint.
- Throughput.
- Queue lag.
- Tiempo de procesado de media.
- Webhook success/failure rate.
- Story expiration lag.
- DB connections y slow queries.

### 11.3 Alertas críticas
- Fallo de conexión a DB.
- Fallo de Redis.
- Error rate API > umbral.
- Jobs atascados.
- Fallo de webhooks Stripe.
- Saturación CPU/RAM en backend.
- Caída de procesado de media.

---

## 12. Seguridad operacional

- HTTPS obligatorio.
- WAF activo.
- Rate limiting per IP y per user.
- Security headers.
- Acceso mínimo a recursos productivos.
- MFA para cuentas cloud críticas.
- Logs de administración y cambios sensibles.
- Segmentación entre servicios públicos y privados.

---

## 13. Disaster recovery

### Objetivos iniciales razonables
- RTO: 1-4 horas según severidad.
- RPO: 15-60 minutos.

### Runbook mínimo
- Restauración de DB.
- Revalidación de webhooks.
- Recuperación de workers.
- Verificación de buckets y URLs firmadas.
- Smoke tests críticos: auth, posts, stories, chat, billing.

---

## 14. Coste y escalado

La estrategia anterior estaba orientada a un backend social clásico, pero ahora el coste real debe contemplar también media, chat y stories. Los costes más sensibles serán:

- Storage y egress de media.
- Postgres gestionado.
- Redis.
- Procesado de media/video.
- Observabilidad.
- WAF/CDN.

La prioridad de CircleSfera no debe ser optimización extrema de coste en esta fase, sino evitar arquitectura cara de operar y difícil de revertir.

---

## 15. Decisiones cerradas

- Se elimina cualquier referencia oficial a TypeORM migrations.
- Prisma Migrate pasa a ser la única estrategia de migración documentada.
- La infraestructura debe dar soporte explícito a stories, chat, media processing, Stripe webhooks y pgvector.
- Kubernetes/EKS no es prioridad inicial; ECS Fargate o equivalente gestionado es preferible.
- Los datos de usuarios europeos deben mantenerse en infraestructura UE salvo excepción jurídica y contractual validada.
