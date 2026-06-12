# Estrategia de Backups - CircleSfera

**Versión:** 2.0 (Adaptada para PostgreSQL)  
**Fecha:** Junio 2026  
**Owner:** DevOps Lead @ CircleSfera

---

## Objetivo

Definir la estrategia de backups para garantizar la recuperación de datos en caso de pérdida, corrupción o desastre. Esta estrategia cubre PostgreSQL (datos de aplicación estructurados), MinIO/S3 (archivos multimedia) y Redis (caché y sesiones, no crítico para backups).

---

## Alcance

### Datos Críticos a Respaldar

1. **PostgreSQL (vía Prisma)** - Base de datos relacional principal
   - Tablas: users, profiles, posts, frames, comments, likes, follows, saves, collections, stories, notifications, messages, platform_subscriptions, admin_audit_logs, etc.
   - **Prioridad:** 🔴 CRÍTICA

2. **MinIO/S3** - Almacenamiento de archivos multimedia
   - Videos de frames
   - Imágenes de posts
   - Avatares de usuarios
   - Thumbnails
   - **Prioridad:** 🔴 CRÍTICA

3. **Redis** - Caché y WebSockets PubSub
   - Caché de feeds y rate limiting
   - Estado de presencias / sesiones
   - **Prioridad:** 🟡 MEDIA (normalmente se descarta; se reconstruye en caliente)

---

## Estrategia de Backups

### PostgreSQL

#### Frecuencia
- **Backups completos (Full Dumps):** Diarios a las 02:00 UTC
- **Backups incrementales / continuos (WAL Archiving):** Configurado a nivel de clúster / proveedor cloud (Point-In-Time Recovery - PITR continuo)
- **Backups antes de migraciones:** Manual (ejecutado en CI/CD antes de `npx prisma migrate deploy`)

#### Retención
- **Backups diarios (Dumps):** 30 días
- **Archivos WAL (PITR):** 7 a 14 días (dependiendo del entorno y proveedor)
- **Backups mensuales (Archivados):** 12 meses (último backup de cada mes en almacenamiento en frío)

#### Método
Para extracciones lógicas manuales o scripts on-premise:
```bash
# Backup completo en formato de directorio comprimido (optimizado para pg_restore)
pg_dump --dbname="$DATABASE_URL" --format=directory --jobs=4 --file=/backups/postgres/full/$(date +%Y%m%d_%H%M%S)
```

#### Compresión
- Usar compresión nativa de `pg_dump` o comprimir posteriormente el tarball con `gzip`/`zstd` para ahorrar espacio.
- Tiempo estimado de compresión depende del tamaño de base de datos y recursos asignados.

#### Almacenamiento
- **Local temporal:** `/backups/postgres/`
- **Remoto:** S3 bucket `circlesfera-db-backups` (retención media/larga)
- **Región:** Múltiples regiones para redundancia (Cross-Region Replication en S3).

### MinIO/S3

#### Frecuencia
- **Backups completos (Sync base):** Semanales (domingos a las 03:00 UTC)
- **Sincronización incremental:** Diaria a las 04:00 UTC (dependiendo de si se usan Lifecycle Policies o AWS Backup nativo)

#### Retención
- **Backups semanales:** 8 semanas
- **Backups mensuales:** 12 meses en Storage Class de archivado (Glacier).

#### Método
```bash
# Sincronización al bucket de respaldo
aws s3 sync s3://$S3_BUCKET_MEDIA s3://$BACKUP_BUCKET/media/latest --storage-class STANDARD_IA
```

#### Almacenamiento
- **Bucket principal:** `circlesfera-media` (producción)
- **Bucket de backup:** `circlesfera-backups-media` (clase Glacier/IA para ahorro)

### Redis

#### Frecuencia
- No críticos para retención a largo plazo.

#### Método (Si se requiere RDB)
```bash
redis-cli --rdb /backups/redis/dump_$(date +%Y%m%d).rdb
```

---

## Scripts de Backup (Ejemplo)

### Script Principal: `scripts/backup.sh`

```bash
#!/bin/bash
set -euo pipefail

# Configuración
DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-circlesfera-backups}"

log() { echo -e "\033[0;32m[$(date +'%Y-%m-%d %H:%M:%S')]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1" >&2; }

# Backup de PostgreSQL
backup_postgres() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/postgres/full/pg_backup_${timestamp}.dump"
    
    log "Iniciando backup de PostgreSQL..."
    mkdir -p "${BACKUP_DIR}/postgres/full"
    
    # Se recomienda usar formato custom (-Fc) para mejor compresión y opciones de restauración
    pg_dump --dbname="${DATABASE_URL}" -Fc --file="${backup_file}" || {
        error "Error en backup completo de PostgreSQL"
        return 1
    }
    
    log "Subiendo backup de PostgreSQL a S3..."
    aws s3 cp "${backup_file}" "s3://${S3_BACKUP_BUCKET}/postgres/full/pg_backup_${timestamp}.dump" || {
        error "Error subiendo backup a S3"
        return 1
    }
    
    log "Backup completado exitosamente."
}

# (Para el script de restauración se utilizaría pg_restore -d "${DATABASE_URL}" "${backup_file}")

main() {
    backup_postgres
}

main "$@"
```

---

## Verificación de Backups

### Checklist de Verificación Semanal
- [ ] Script de backup completado con código de salida `0`.
- [ ] Archivo `.dump` en S3 tiene un tamaño coherente (> 0 y similar/mayor al día anterior).
- [ ] Prueba mensual obligatoria: Instanciar una base de datos local temporal, ejecutar `pg_restore` y validar mediante `npx prisma db pull` o tests E2E que los esquemas coinciden y los datos están íntegros.

---

## Procedimiento de Restauración Parcial vs Completa

### Restauración Completa (Disaster Recovery)
1. **Detención:** Parar contenedores y tráfico hacia el backend (evitar transacciones concurrentes).
2. **Recreación:** Drop y re-creación de base de datos vacía.
3. **Restauración:**
   ```bash
   pg_restore --dbname="$DATABASE_URL" --jobs=4 --clean --if-exists /path/to/backup.dump
   ```
4. **Validación:** Arrancar Prisma Client y ejecutar validación interna (health checks).
5. **Apertura:** Reactivar el tráfico.

### Restauración Parcial (Por tabla)
- Ocurre muy rara vez. Para recuperar datos corruptos específicos (ej. un usuario borrado por error), restaurar el volcado completo en una *base de datos auxiliar* y realizar consultas de `INSERT INTO db_prod.users SELECT * FROM db_backup.users WHERE id = 'xyz'`.

---

**Última actualización:** Junio 2026
