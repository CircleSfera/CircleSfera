# Documentation status

**Last status note:** Jul 2026 — PRD v4.0 remediation on `main`; prod schema catch-up for polls/QnA/live/voice

## Remediation vs PRD v4.0 (implemented)

- Moderation transparency: author notify on AI/admin hide/restore; appeals UI (`Settings → Appeals`); appeal outcome notify
- User control: mute entry on profile/post menus; `UserSettings` prefs applied to feed (content rating) + push
- Monetization contracts: one active platform plan enforced; `GET /payments/status`; creator sub list/check/cancel; Elite guard scoped
- Discovery: ProfileEmbedding writer on profile update + `npm run embeddings:backfill`; recommendation signals; poll/QnA create (posts) + display
- Promotions: cancel → `CANCELLED`; `PATCH` edit targeting/endDate; no dedicated `PAUSED` / Stripe auto-refunds (deferred by product)

## Production incident (Jul 2026)

After merging feed hydration for `poll` / `qnaBox`, prod returned feed/stories **500** because `polls`, `qna_boxes`, `live_streams`, and message/comment voice columns existed in `schema.prisma` but had **no prior Prisma migration**. Fixed by migration `20260723010000_add_interactive_live_voice_fields` plus hybrid-feed vector reads from `post_embeddings`.

Follow-up: CI runs `scripts/check-prisma-schema-migrations.sh` (replay migrations onto a shadow Postgres, then `prisma migrate diff --exit-code`) so schema/migration drift fails the pipeline before deploy. Catch-up migration `20260723020000_appeals_profile_embeddings_drop_payouts` aligns `appeals` / `profile_embeddings` and drops orphan `payout_requests`. Deploy also runs a post-healthy API smoke (`/health`, `/feed/foryou`, `/stories`, `/live/active`) and fails on 5xx.

## Still deferred / out of scope

- Promotion `PAUSED` status + Stripe proportional refunds (schema fields exist for refunds; not wired)
- Feed-preference domain tables (absent by design in PRD future)

## Doc / source of truth

Documents **01–08** (Abr 2026 origins) remain **partially stale** in places relative to the current `schema.prisma` and backend modules, except where explicitly revised (e.g. **01 PRD v4.0**, **03 API inventory**, **ADR-0001**).

When in doubt: `schema.prisma` → implemented code → API contracts → these markdown files.

## Production infra (current)

- Deploy target: **OVH VPS** via GitHub Actions + `docker-compose.prod.yml` (this is production today).
- **TLS/SSL**: certificates are generated and renewed **on the VPS host**; the compose nginx proxy is HTTP-only behind the host reverse proxy.
- Doc **05-deployment-strategy**: §2 = live OVH topology; Cloudflare/ECS/AWS described only as a **future** target (not in use).
- API inventory regenerated in [03-api-detailed-endpoints.md](./03-api-detailed-endpoints.md) (Jul 2026).
- [ADR-0001](./adr/0001-profile-embedding-retention.md): keep `ProfileEmbedding`; writer on update + backfill script available.
