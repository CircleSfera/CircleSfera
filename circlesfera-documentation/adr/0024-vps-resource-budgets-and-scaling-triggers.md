# ADR-0024: VPS resource budgets and scaling triggers

- **Status:** Accepted
- **Date:** 2026-09-26
- **Deciders:** CircleSfera engineering

## Context

CircleSfera runs as a single-VPS deployment (OVH, `docker-compose.prod.yml`: postgres, redis,
backend, frontend, nginx-proxy co-located). Two of seven resource dimensions — BullMQ queue depth and
media (video transcoding) backlog — already have measurable WARN/ALERT thresholds that are evaluated
proactively and escalate automatically (`OperationalMetricsService`, OBS-003). The other five (CPU,
RAM, disk, database, Redis) either have a threshold that is only checked on request, or no threshold
at all. This ADR states each resource's current signal, threshold, and escalation path explicitly, so
"the VPS is under pressure" stops being a judgment call made after the fact.

The exact OVH VPS tier (vCPU count, RAM size, disk size) is an infrastructure-account fact, not
something derivable from the repository, and is intentionally left unspecified here — thresholds
below are expressed relative to capacity (percentages) or as absolute Node-process limits, not as
host-specific absolute numbers. Recording the current tier is ops bookkeeping outside this ADR's
scope, not a blocker to defining the policy.

## Decision

### Per-resource budget and escalation path

| Resource | Signal source | WARN | ALERT | Escalation path today | Scaling action when sustained |
| --- | --- | --- | --- | --- | --- |
| **Queue backlog** (per BullMQ queue) | `OperationalMetricsService` (`common/observability/operational-metrics.service.ts`) | 100 waiting / 10 failed / 60s oldest-job-age | 500 waiting / 50 failed / 300s oldest-job-age | **Automatic when a Slack webhook is configured** — cron every minute (`@Cron(EVERY_MINUTE)`), emits `system.incident`, which `SlackService` sends to Slack on any ALERT (it no-ops if `SLACK_WEBHOOK_ALERTS`/`SLACK_WEBHOOK_URL` are unset) | Increase worker `concurrency` for the affected queue (`queue-policy.constants.ts`), or add a second backend replica if concurrency is already maxed |
| **Media transcoding backlog** | `OperationalMetricsService` (reads `video-transcoding` queue) | 20 waiting jobs | 100 waiting jobs | **Automatic when a Slack webhook is configured** — same cron/escalation as above | Same as queue backlog; video transcoding is CPU-bound, so also consider vertical VPS scaling before adding concurrency (ffmpeg workers contend for the same CPU) |
| **Disk** | `DiskHealthIndicator.checkStorage('storage', { path: '/', thresholdPercent: 0.9 })` (`health/health.controller.ts`) | — (binary up/down only) | 90% of `/` | **Recurring detection, no alerting** — part of `/api/v1/health`, which the backend Docker healthcheck calls every 15s (`docker-compose.prod.yml`); a failing check marks the container unhealthy and the deploy pipeline's health probe consumes that state, but nothing sends an alert on it between deploys | Prune old pre-deploy Postgres backups / rotate logs; if media-driven, this is the trigger to execute the S3/Cloudinary migration documented in ADR-0008 rather than growing local disk indefinitely |
| **RAM (Node process)** | `MemoryHealthIndicator.checkHeap` / `checkRSS`, 1GB each (`health/health.controller.ts`) | — (binary up/down only) | 1GB heap or 1GB RSS | **Recurring detection, no alerting** — same 15s Docker healthcheck path as disk | Restart the backend container (transient leak) or increase the container memory limit / VPS RAM if sustained across restarts |
| **Database (Postgres)** | `PrismaHealthIndicator.pingCheck` (connectivity only) | — | connection failure | **Recurring detection, no alerting** — same 15s Docker healthcheck path as disk | Investigate connection pool saturation (`pg_stat_activity`) or vertical scale; no query-latency or pool-saturation threshold exists yet (see Known gaps) |
| **Redis** | `RedisHealthIndicator.pingCheck` (`health/redis-health.indicator.ts`, ARCH-002) | — | connection/ping failure | **Recurring detection, no alerting** — same 15s Docker healthcheck path as disk | Investigate `INFO memory` / eviction rate manually; no memory-usage-percentage threshold exists yet (see Known gaps) |
| **CPU** | None | — | — | **Not implemented** | N/A until a signal exists (see Known gaps) |

### Escalation tiers, stated explicitly

1. **Automatic (push), when a Slack webhook is configured:** queue backlog and media backlog only.
   Evaluated every minute, escalates to the Slack incident channel via the `system.incident` event
   (`EVENT_OWNERS['system.incident'] = 'SlackService'`, per ADR-0019) the moment any ALERT threshold
   is crossed — `SlackService` itself no-ops if `SLACK_WEBHOOK_ALERTS`/`SLACK_WEBHOOK_URL` aren't set,
   so this tier's guarantee is conditional on that configuration being present in production.
2. **Recurring detection without escalation:** disk, RAM, database, Redis. All four are evaluated
   every 15 seconds by the backend Docker healthcheck (`docker-compose.prod.yml`, which calls
   `/api/v1/health`) — this is scheduled, automatic detection, not a human polling. A failing check
   marks the container unhealthy, and the deploy pipeline's health probe and rollback
   (`07-production-change-control.md` section 4) consume that state at deploy time. What's missing is
   escalation: no repository path pages anyone when the state changes between deploys. An operator (or
   the next deploy) is still how these get noticed today.
3. **Absent:** CPU has no signal of any kind, automatic or manual.

## Consequences

- Queue and media pressure are caught within a minute, any time, independent of deploys, **provided a
  Slack webhook is actually configured in production** — this tier's guarantee is conditional, not
  unconditional, and should be verified rather than assumed.
- Disk/RAM/DB/Redis pressure is evaluated every 15 seconds by the backend Docker healthcheck, and a
  failing check can make the deploy pipeline refuse or roll back a deploy into an already-degraded
  host — but the pressure can still persist unnoticed *between* deploys, because no repository path
  turns that recurring unhealthy state into an alert. A slow disk leak discovered only because the
  next deploy's health probe fails is a real, accepted risk under this ADR, not something this
  documentation change resolves.
- CPU has no budget at all: a sustained CPU-bound backlog (e.g. concurrent video transcodes) is only
  visible indirectly, through its effect on the media/queue thresholds above, never directly.

### Known gaps (documented, not fixed by this ADR)

Closing these is future work, not silently rolled into this documentation-gate ticket:

- Wire the existing 15s Docker healthcheck state (or a parallel check in `OperationalMetricsService`'s
  cron) for disk/RAM/DB/Redis to the same `system.incident` escalation path used by queue/media,
  instead of leaving detection un-escalated between deploys.
- Verify `SLACK_WEBHOOK_ALERTS`/`SLACK_WEBHOOK_URL` are actually set in production `.env.production`;
  the queue/media escalation tier above silently does nothing without them.
- Add a CPU signal (host load average via a lightweight exec, or `docker stats` scraped periodically)
  with a WARN/ALERT pair expressed relative to vCPU count once the VPS tier is on record.
- Add a Postgres connection-pool-saturation or query-latency threshold beyond bare connectivity.
- Add a Redis memory-usage-percentage or eviction-rate threshold beyond bare ping.
- Record the actual current VPS tier (vCPU/RAM/disk) somewhere in `circlesfera-documentation/` as an
  operational fact, so future percentage-based thresholds have an absolute baseline to reason about.