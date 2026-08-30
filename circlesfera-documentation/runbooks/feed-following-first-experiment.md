# Runbook: Home For You — `feed_home_following_first`

**Flag key:** `feed_home_following_first`  
**Treatment:** `GET /feed/foryou` serves the **existing following feed** ranking.  
**Control:** current hybrid For You ranking (default).

## Prerequisites

- Backend deployed with `ExperimentsService` and feed wiring (`feed-experiments.ts`).
- Migration `20260830190000_appeal_ticket_resolved_at_feed_flag` applied (seeds default-off row), **or** flag created manually in Admin → Experiments.

## Rollout (recommended)

1. Open **Admin → Experiments**.
2. Confirm row `feed_home_following_first` exists (`isEnabled=false`, `percentage=0`).
3. Enable the flag (`isEnabled=true`) at **10%** assignment (hash on `User.id`).
4. Monitor for 7–14 days:
   - Dwell time (`useDwellTime` → analytics queue)
   - Error rate on `GET /feed/foryou`
   - Support volume / report queue (Trust tab)
5. If metrics hold, step to **20%**, then **50%** — do **not** jump to 100% without product sign-off.
6. To roll back: set `isEnabled=false` or `percentage=0` — no redeploy required (cache TTL ~5 min).

## Per-user override

`UserExperiment` rows override the percentage bucket for QA:

- `variant`: `treatment` / `control` / `true` / `false`

## Success criteria (Phase 2)

- Neutral or improved dwell vs control
- No regression in feed 5xx or p95 latency
- Document outcome in `CHANGELOG.md` when promoting beyond 50%

## References

- [12-global-roadmap.md](../12-global-roadmap.md) Phase 2 leftover
- Backend test: `feed.service.spec.ts` — following-first branch
