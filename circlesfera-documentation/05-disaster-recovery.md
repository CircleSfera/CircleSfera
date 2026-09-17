# Disaster Recovery Runbook & Backup SLAs — CircleSfera

> **Source of Truth:** Este documento define la política oficial de copias de seguridad,
> recuperación ante desastres (Disaster Recovery) y los objetivos de RPO y RTO para la
> plataforma CircleSfera. Satisface los requerimientos de confiabilidad y continuidad operativa.

---

## 1. Objetivos de Recuperación (SLAs)

| Componente de Datos | Clasificación | RPO Máximo (Recovery Point Objective) | RTO Máximo (Recovery Time Objective) | Estrategia de Respaldo |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL (Prisma Core)** | Crítico | $\le 24$ horas (objetivo operacional $\le 1$h con WAL) | $\le 30$ minutos | Dump lógico (`pg_dump -Fc`), verificación TOC y replicación off-host a S3. |
| **Transacciones y Ledger Financiero** | Crítico / Inmutable | RPO = 0 (Sin pérdida de estado) | $\le 30$ minutos | Consistencia transaccional ACID en DB + Reconciliación idempotente de webhooks Stripe. |
| **Almacenamiento Multimedia (`uploads/`)** | Alto | $\le 24$ horas | $\le 45$ minutos | Archivo comprimido (`.tar.gz`) con rotación y subida a bucket S3 / MinIO off-host. |
| **Redis / BullMQ / Cache** | Efímero / Reconstruible | $\le 15$ minutos | $\le 5$ minutos | Persistencia AOF/RDB. Colas reconstruibles y caché rehidratable desde PostgreSQL. |

---

## 2. Arquitectura de Respaldo y Replicación Off-Host

El sistema de backups opera de forma desatendida mediante tareas programadas (cron) y scripts de aislamiento:

```mermaid
flowchart LR
    subgraph Host["VPS Producción (OVH)"]
        PG[(PostgreSQL pgvector)] -->|pg_dump -Fc| Script["backup-postgres.sh"]
        Uploads["Volumen uploads/"] -->|tar -czf| ScriptUp["backup-uploads.sh"]
        Script -->|Validación TOC| LocalStorage["/srv/circlesfera/backups (Retención 30d)"]
        ScriptUp --> LocalStorage
    end

    subgraph OffHost["Almacenamiento Off-Host Remoto"]
        LocalStorage -->|AWS CLI / rclone S3| S3["AWS S3 / MinIO Glacier Bucket"]
    end

    subgraph Drill["Verificación Periódica"]
        ScriptTest["verify-backup-restore.sh"] -->|Restaura en DB aislada| DBTest[(CircleSfera_restore_test)]
        DBTest -->|Valida _prisma_migrations & FKs| AuditReport["Informe de Integridad JSON"]
    end
```

### 2.1. Programación Automática (Cron)
- **Frecuencia:** Diario a las **02:00 UTC** (`scripts/install-backup-cron.sh`).
- **Retención local:** 30 días en `/srv/circlesfera/backups/postgres/full`.
- **Destino Off-host:** `s3://${S3_BACKUP_BUCKET}/postgres/full/` y `s3://${S3_BACKUP_BUCKET}/uploads/`.
- **Alerta de Estancamiento:** Si un backup supera las 26 horas de antigüedad sin renovación exitosa, se considera una violación del SLA de RPO.

---

## 3. Verificación Automatizada de Restauración (Restore Drills)

Un respaldo cuya restauración no ha sido probada **no constituye una copia de seguridad válida**.

### 3.1. Script de Verificación (`verify-backup-restore.sh`)
El comando `npm run db:verify-restore` ejecuta el ciclo completo de validación en un entorno aislado:
1. Crea un volcado de prueba o toma el dump más reciente.
2. Comprueba la integridad estructural del archivo mediante `pg_restore --list`.
3. Levanta/inicializa una base de datos efímera (`CircleSfera_restore_test`).
4. Ejecuta `pg_restore` sobre la base de datos efímera.
5. Valida que la tabla `_prisma_migrations` contenga todas las migraciones aplicadas sin errores.
6. Realiza conteo de tablas fundamentales (`User`, `Profile`, `Post`, `Wallet`) y verifica consistencia referencial.
7. Destruye la base de datos de prueba y emite un informe JSON estructurado.

### 3.2. Calendario de Simulacros
- **Verificación Automatizada:** Semanalmente en CI / script de mantenimiento del servidor.
- **Simulacro de Recuperación en Frío (Game Day):** Trimestralmente por el equipo de ingeniería.

---

## 4. Runbook de Recuperación ante Desastres en Frío (Cold DR)

Este procedimiento debe ejecutarse paso a paso en caso de pérdida total del servidor host, corrupción irrecuperable de disco o desastre de centro de datos.

### Paso 1: Aprovisionamiento del Nuevo Host
- Desplegar una instancia Linux (Ubuntu 22.04 LTS o superior) con Docker y Docker Compose instalados.
- Clonar el repositorio oficial de CircleSfera en `/srv/circlesfera`.
- Descargar el archivo `.env.production` desde el gestor seguro de secretos (Bitwarden / GitHub Secrets `ENV_PRODUCTION_B64`).

### Paso 2: Despliegue de Servicios Base
Iniciar exclusivamente las capas de datos en el nuevo host:
```bash
cd /srv/circlesfera
docker compose -f docker-compose.prod.yml up -d postgres redis minio
```
Esperar a que PostgreSQL esté en estado saludable (`healthy`):
```bash
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U postgres
```

### Paso 3: Descarga del Respaldo Off-Host
Obtener el último volcado verificado desde el almacenamiento S3:
```bash
mkdir -p /srv/circlesfera/backups/restore
aws s3 cp s3://${S3_BACKUP_BUCKET}/postgres/full/latest.dump \
  /srv/circlesfera/backups/restore/pg_latest.dump
```

### Paso 4: Restauración de Base de Datos
Ejecutar el script canónico de restauración requiriendo la confirmación explícita:
```bash
CONFIRM=YES DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/CircleSfera" \
  ./scripts/restore-postgres.sh /srv/circlesfera/backups/restore/pg_latest.dump
```

### Paso 5: Restauración de Archivos Multimedia
Descargar y descomprimir el volumen de subidas:
```bash
aws s3 cp s3://${S3_BACKUP_BUCKET}/uploads/latest.tar.gz \
  /srv/circlesfera/backups/restore/uploads_latest.tar.gz

tar -xzf /srv/circlesfera/backups/restore/uploads_latest.tar.gz -C /srv/circlesfera/
```

### Paso 6: Verificación de Esquema y Migraciones
Desplegar cualquier migración pendiente sobre el estado restaurado:
```bash
cd /srv/circlesfera/circlesfera-backend
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/CircleSfera" \
  npx prisma migrate deploy
```

### Paso 7: Arranque del Resto del Stack y Pruebas de Humo
Iniciar el backend, frontend y proxy Nginx:
```bash
cd /srv/circlesfera
docker compose -f docker-compose.prod.yml up -d
```
Verificar los endpoints de salud y el contrato de identidad de usuario:
```bash
curl -f https://api.circlesfera.com/api/v1/health
npm run smoke:profile-drift
```

---

## 5. Contactos de Emergencia y Matriz de Escalado

| Rol | Responsabilidad | Canal Primario |
| :--- | :--- | :--- |
| **Incident Commander (IC)** | Declaración de desastre, coordinación global y decisiones de corte de servicio. | Teléfono / Canal P0 Slack |
| **Database Administrator (DBA) / Ops** | Ejecución de scripts de restauración y validación de integridad de datos. | Canal P0 Slack |
| **Communications Lead** | Actualización de página de estado (`status.circlesfera.com`) y notificación a usuarios. | Canal P0 Slack |
