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
| **Queue backlog** (per BullMQ queue) | `OperationalMetricsService` (`common/observability/operational-metrics.service.ts`) | 100 waiting / 10 failed / 60s oldest-job-age | 500 waiting / 50 failed / 300s oldest-job-age | **Automatic** — cron every minute (`@Cron(EVERY_MINUTE)`), emits `system.incident` → Slack on any ALERT | Increase worker `concurrency` for the affected queue (`queue-policy.constants.ts`), or add a second backend replica if concurrency is already maxed |
| **Media transcoding backlog** | `OperationalMetricsService` (reads `video-transcoding` queue) | 20 waiting jobs | 100 waiting jobs | **Automatic** — same cron/escalation as above | Same as queue backlog; video transcoding is CPU-bound, so also consider vertical VPS scaling before adding concurrency (ffmpeg workers contend for the same CPU) |
| **Disk** | `DiskHealthIndicator.checkStorage('storage', { path: '/', thresholdPercent: 0.9 })` (`health/health.controller.ts`) | — (binary up/down only) | 90% of `/` | **Manual/pull-only** — exposed at `/health` and `/health/readiness`; checked by the deploy pipeline's post-deploy health probe, not proactively polled or pushed to Slack | Prune old pre-deploy Postgres backups / rotate logs; if media-driven, this is the trigger to execute the S3/Cloudinary migration documented in ADR-0008 rather than growing local disk indefinitely |
| **RAM (Node process)** | `MemoryHealthIndicator.checkHeap` / `checkRSS`, 1GB each (`health/health.controller.ts`) | — (binary up/down only) | 1GB heap or 1GB RSS | **Manual/pull-only** — same as disk | Restart the backend container (transient leak) or increase the container memory limit / VPS RAM if sustained across restarts |
| **Database (Postgres)** | `PrismaHealthIndicator.pingCheck` (connectivity only) | — | connection failure | **Manual/pull-only** — same as disk | Investigate connection pool saturation (`pg_stat_activity`) or vertical scale; no query-latency or pool-saturation threshold exists yet (see Known gaps) |
| **Redis** | `RedisHealthIndicator.pingCheck` (`health/redis-health.indicator.ts`, ARCH-002) | — | connection/ping failure | **Manual/pull-only** — same as disk | Investigate `INFO memory` / eviction rate manually; no memory-usage-percentage threshold exists yet (see Known gaps) |
| **CPU** | None | — | — | **Not implemented** | N/A until a signal exists (see Known gaps) |

### Escalation tiers, stated explicitly

1. **Automatic (push):** queue backlog and media backlog only. Evaluated every minute, escalates to
   the Slack incident channel via the `system.incident` event (`EVENT_OWNERS['system.incident'] =
   'SlackService'`, per ADR-0019) the moment any ALERT threshold is crossed. No operator action is
   needed to notice the problem.
2. **Manual (pull):** disk, RAM, database, Redis. All four are real, load-bearing checks — they gate
   the deploy pipeline's health probe and rollback (`07-production-change-control.md` section 4) and
   are visible on demand at `/health`/`/health/readiness` — but nothing evaluates them on a schedule
   or pages anyone when they cross their threshold between deploys. An operator (or the next deploy)
   is how these get noticed today.
3. **Absent:** CPU has no signal of any kind, automatic or manual.

## Consequences

- Queue and media pressure are caught within a minute, any time, independent of deploys. This is the
  strongest guarantee the platform has today and should be the template for closing the gaps below.
- Disk/RAM/DB/Redis pressure is caught reliably at deploy time (the health probe would refuse/rollback
  a deploy into an already-degraded host) but can silently persist between deploys — a slow disk leak
  discovered only because the next deploy's health probe fails is a real, accepted risk under this
  ADR, not something this documentation change resolves.
- CPU has no budget at all: a sustained CPU-bound backlog (e.g. concurrent video transcodes) is only
  visible indirectly, through its effect on the media/queue thresholds above, never directly.

### Known gaps (documented, not fixed by this ADR)

Closing these is future work, not silently rolled into this documentation-gate ticket:

- Extend `OperationalMetricsService`'s cron to also evaluate disk/RAM/DB/Redis and escalate via the
  same `system.incident` path, instead of leaving them pull-only.
- Add a CPU signal (host load average via a lightweight exec, or `docker stats` scraped periodically)
  with a WARN/ALERT pair expressed relative to vCPU count once the VPS tier is on record.
- Add a Postgres connection-pool-saturation or query-latency threshold beyond bare connectivity.
- Add a Redis memory-usage-percentage or eviction-rate threshold beyond bare ping.
- Record the actual current VPS tier (vCPU/RAM/disk) somewhere in `circlesfera-documentation/` as an
  operational fact, so future percentage-based thresholds have an absolute baseline to reason about.