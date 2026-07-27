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
- Production should use S3 or Cloudinary — local disk is not a prod strategy.
