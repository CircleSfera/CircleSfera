# ADR-0008: Pluggable storage providers (S3, Cloudinary, local)

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

Uploads (images, video, avatars) must work in local development and production without rewriting the uploads service for each environment.

## Decision

Abstract uploads behind a `StorageProvider` interface, selected at module bootstrap:

1. **S3** when `AWS_S3_BUCKET` is configured
2. Else **Cloudinary** when `CLOUDINARY_NAME` is configured
3. Else **local filesystem** (`LocalStorageProvider`) for development

Media processing (Sharp/WebP, video queue) stays in CircleSfera; only binary storage/deletion is provider-specific.

## Consequences

- One upload API for app code; ops choose backend via env.
- Feature parity across providers is not guaranteed (e.g. transforms, CDN URLs differ).

### Amendment (2026-09-26): current provider and migration boundary

Production runs `LocalStorageProvider`, not S3 or Cloudinary. This corrects the original
Consequences line above ("local disk is not a prod strategy"), which was aspirational at write time
and never matched the deployed topology — no ADR or product decision has since directed a migration
to S3/Cloudinary, and treating one as done or in progress would misstate the current state.

Evidence this is genuinely the current, intentional deployment (not an oversight):

- `docker-compose.prod.yml` defines a persistent named volume (`uploads_data`) mounted into the
  backend container at `/app/circlesfera-backend/uploads`, and mounts the same volume read-only into
  `nginx-proxy` at `/usr/share/nginx/html/uploads` for direct static serving. This is deliberate,
  wired infrastructure, not a fallback nobody noticed.
- `scripts/upload-prod-env.sh` — which hard-fails a prod env upload missing any genuinely required
  secret (`JWT_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`, `TURNSTILE_SECRET_KEY`, `OPENAI_API_KEY`,
  `LIVEKIT_API_KEY`/`SECRET`, etc.) — never validates `AWS_S3_BUCKET` or `CLOUDINARY_NAME`.
- `.github/workflows/deploy.yml` never references S3, Cloudinary, or storage configuration at all.

**Migration boundary.** The `StorageProvider` interface (`circlesfera-backend/src/uploads/providers/`)
remains the sole seam: `S3Provider` and `CloudinaryProvider` are fully implemented and already
selected automatically over `LocalStorageProvider` when `AWS_S3_BUCKET` or `CLOUDINARY_NAME` is set
(`uploads.module.ts`'s factory, in that priority order). Migrating production is an operations change
(provision the bucket/account, set the env var, cut the VPS's `uploads_data` volume over) — it does
not require application code changes, and must stay that way. `app.module.ts` separately registers
`ServeStaticModule` for the local `uploads/` directory whenever `CLOUDINARY_NAME` is unset (it does
not check `AWS_S3_BUCKET`, a pre-existing gap worth tightening if/when S3 is actually turned on); any
future provider addition must preserve the broader pattern of zero call-site changes outside
`uploads.module.ts`'s factory and the provider implementations themselves.

**Known exception (out of this boundary, not a defect to fix here):** `users/data-export.service.ts`
and `users/data-export.processor.ts` read/write GDPR data-export ZIPs directly via local `fs`,
bypassing `StorageProvider` entirely. This is a separate, pre-existing mechanism for a different
capability (user-initiated data export, not media upload) and is out of scope for this ADR — noted
here only so "StorageProvider is the sole application-facing storage capability" isn't read as
already true for that path.
