# Scripts Operativos y de Soporte — CircleSfera

Colección de herramientas de automatización, base de datos, diagnóstico, despliegue y documentación para CircleSfera.

---

## 1. Matriz de Scripts

| Comando / Script | Entorno | Propósito | Nivel de Riesgo |
| :--- | :--- | :--- | :--- |
| `npm run db:backup`<br>`./scripts/backup-postgres.sh` | VPS / Local | Dump lógico de PostgreSQL (`pg_dump -Fc`), verificación de integridad TOC, retención local y subida S3 opcional. | **Bajo** (Sólo lectura) |
| `./scripts/backup-uploads.sh` | VPS / Local | Archivo comprimido (`.tar.gz`) del volumen de archivos subidos (`uploads/`) con retención y subida S3 opcional. | **Bajo** (Sólo lectura) |
| `npm run db:restore`<br>`./scripts/restore-postgres.sh` | VPS / Local | Restaura un dump custom-format generado por `backup-postgres.sh`. Requiere `CONFIRM=YES`. | **Alto** (Destructivo en BD destino) |
| `npm run db:verify-restore`<br>`./scripts/verify-backup-restore.sh` | CI / Local / Ops | Drill automatizado de DR: genera/recibe un volcado, verifica TOC, restaura en base de datos efímera y valida tablas/migraciones. | **Bajo** (Aislado en BD temporal) |
| `./scripts/install-backup-cron.sh` | VPS (OVH) | Instala cron diario (02:00 UTC) en el servidor de producción usando Docker Compose. | **Medio** (Modifica `crontab`) |
| `npm run db:check-migrations`<br>`./scripts/check-prisma-schema-migrations.sh` | CI / Local | Detecta desalineaciones (drift) entre `schema.prisma` y las migraciones físicas de Prisma. | **Bajo** (Sólo lectura en BD temporal) |
| `npm run db:lint-migrations`<br>`node scripts/lint-migration-safety.mjs` | CI / Pre-commit | Audita sentencias destructivas (`DROP COLUMN`, `RENAME`, `SET NOT NULL`) garantizando Expand/Contract. | **Bajo** (Análisis estático) |
| `npm run db:test-rollback`<br>`./scripts/test-migration-rollback.sh` | CI / Local / Ops | Simula la reversión de migraciones en BD efímera ejecutando `down.sql` y validando reentrada hacia adelante. | **Bajo** (Aislado en BD temporal) |
| `./scripts/prisma-migrate-deploy.sh` | Contenedor Prod | Ejecuta `prisma migrate deploy` en el arranque con recuperación automática de incidencias históricas. | **Medio** (Aplica migraciones) |
| `npm run env:upload`<br>`./scripts/upload-prod-env.sh` | Local Ops | Valida variables críticas de `.env.production` y actualiza el secret `ENV_PRODUCTION_B64` en GitHub vía `gh`. | **Medio** (Actualiza secretos) |
| `./scripts/setup-github-e2e.sh` | Local Ops | Configura credenciales y flags de pruebas E2E en GitHub Secrets/Variables. | **Bajo** (Configuración) |
| `npm run ops:diagnose-crypto`<br>`node scripts/diagnose-message-crypto.mjs` | Contenedor Ops | Diagnostica el estado de cifrado AES-256-GCM de los mensajes (`Message.content`) contra candidatos de claves. | **Bajo** (Sólo lectura) |
| `npm run smoke:profile-drift`<br>`node scripts/validate-profile-drift-smoke.mjs` | Local / Post-deploy | Smoke test HTTP contra contratos de identidad de usuario y perfil (ADR-0015). | **Bajo** (Pruebas controladas) |
| `npm run docs:api-inventory`<br>`node scripts/generate-api-inventory.mjs` | Local | Escanea controladores NestJS y regenera `circlesfera-documentation/03-api-catalog.generated.md`. | **Bajo** (Documentación) |

---

## 2. Guía de Uso por Dominio

### A. Base de Datos y Backups (P0)

#### `backup-postgres.sh`
Genera un volcado lógico comprimido de PostgreSQL, valida su tabla de contenidos (TOC) y rota volcados antiguos.
```bash
# Backup local con retención de 30 días
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" ./scripts/backup-postgres.sh

# Backup con subida automática a bucket S3 / MinIO
DATABASE_URL="..." S3_BACKUP_BUCKET="circlesfera-backups" ./scripts/backup-postgres.sh
```

#### `restore-postgres.sh`
Restaura un dump previamente generado. Por seguridad operativa, exige la variable explícita `CONFIRM=YES`.
```bash
CONFIRM=YES DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera_restore" \
  ./scripts/restore-postgres.sh /path/to/pg_backup_YYYYMMDD_HHMMSS.dump
```

#### `verify-backup-restore.sh`
Simulacro automatizado de restauración ante desastres (Disaster Recovery Drill). Realiza una prueba completa end-to-end de respaldo y restauración en una base de datos efímera aislada (`CircleSfera_restore_test`), verificando la integridad del catálogo TOC, tablas públicas, migraciones de Prisma y consistencia de datos sin afectar a producción.
```bash
# Test integral desatendido (crea dump temporal, restaura, valida y limpia)
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" npm run db:verify-restore

# Test de un dump específico ya generado
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" \
  ./scripts/verify-backup-restore.sh /path/to/pg_backup_20260917_020000.dump
```

#### `install-backup-cron.sh`
Diseñado para ejecutarse una vez en el servidor de producción (VPS):
```bash
cd /srv/circlesfera && ./scripts/install-backup-cron.sh
```

---

### B. Migraciones y Esquema de Prisma

#### `check-prisma-schema-migrations.sh`
Utilizado tanto en GitHub Actions (`ci-quality.yml`) como en desarrollo local para garantizar que nunca se comiteen cambios a `schema.prisma` sin su correspondiente migración SQL en `prisma/migrations/`.
```bash
DATABASE_URL="postgresql://prisma:prisma@localhost:5432/schema_check" \
  ./scripts/check-prisma-schema-migrations.sh
```

#### `lint-migration-safety.mjs`
Auditor estático de seguridad de migraciones que verifica el cumplimiento del patrón Expand/Contract para compatibilidad con versiones anteriores ($N-1$).
```bash
# Escaneo general de migraciones
npm run db:lint-migrations

# Escaneo únicamente de migraciones en staging de Git
npm run db:lint-migrations -- --staged
```

#### `test-migration-rollback.sh`
Simulacro automatizado de reversión de esquema en una base de datos efímera. Ejecuta el script `down.sql`, resuelve la migración como revertida en `_prisma_migrations`, comprueba el retorno al estado previo y valida la reaplicación hacia adelante.
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" npm run db:test-rollback
```

#### `prisma-migrate-deploy.sh`
Script de entrypoint utilizado por `circlesfera-backend/docker-entrypoint.sh` y `docker-compose.prod.yml` para desplegar migraciones de forma segura antes de iniciar el proceso de Node.js.

---

### C. Gestión de Secretos y Despliegue

#### `upload-prod-env.sh`
Valida la presencia y longitud mínima de secretos críticos (`JWT_SECRET`, `ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, etc.) antes de codificarlos en base64 y subirlos a GitHub Actions.
```bash
# Validar y subir secreto a GitHub
./scripts/upload-prod-env.sh

# Validar, subir secreto y disparar despliegue a producción
./scripts/upload-prod-env.sh --deploy
```

---

### D. Diagnóstico y Criptografía

#### `diagnose-message-crypto.mjs`
Se utiliza durante o después de la rotación de claves de cifrado de mensajes (`ENCRYPTION_KEY`). Clasifica los mensajes en la base de datos según si están en texto plano, cifrados con la clave actual o cifrados con claves legacy.
```bash
DATABASE_URL="..." ENCRYPTION_KEY="..." node scripts/diagnose-message-crypto.mjs
```
> Para re-cifrar los mensajes detectados con claves legacy, ejecutar:
> `cd circlesfera-backend && npx tsx src/scripts/reencrypt-messages.ts`

---

### E. Pruebas de Humo (Smoke) y Catálogo de APIs

#### `validate-profile-drift-smoke.mjs`
Verifica la integridad de las respuestas de la API en relación con la separación de identidades `User` vs `Profile` (ADR-0015).
```bash
# Ejecutar contra el proxy local en puerto 8080 (requiere stack levantado)
npm run smoke:profile-drift

# O especificando una URL base distinta
API_BASE="http://localhost:3000/api/v1" npm run smoke:profile-drift
```

#### `generate-api-inventory.mjs`
Inspecciona estáticamente el código fuente de los controladores NestJS (`*.controller.ts`) y compila la lista oficial de endpoints sin inventar rutas ni depender de suposiciones.
```bash
npm run docs:api-inventory
```

---

### F. Pipeline de Analítica y ETL (`scripts/etl/`)

Contiene las herramientas para exportar eventos relacionales de PostgreSQL hacia ClickHouse:
- `export-analytics-tables.sh`: Dump por lotes de tablas de analítica e interacción.
- `clickhouse-schema.sql`: DDL de las tablas optimizadas para ClickHouse.
- Consultar [`scripts/etl/README.md`](./etl/README.md) para más detalles.
