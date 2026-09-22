# ADR-0005: LiveKit for live streaming

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

CircleSfera needs real-time audio/video for live broadcasts and co-hosts. Building and operating a custom WebRTC SFU would dominate infrastructure cost and reliability work early in the product.

## Decision

Use **LiveKit** as the media plane for live streams:

- Backend issues room tokens and manages stream lifecycle (`LiveService`, `/live/*`).
- Frontend embeds LiveKit React components for broadcaster and viewer.
- Production requires LiveKit credentials (fail-fast when missing).

CircleSfera retains domain state (`LiveStream`, co-host invites, chat/hearts/gifts via API + sockets) and does not replace LiveKit with a self-hosted SFU unless product needs change.

## Consequences

- Faster path to reliable A/V; dependency on LiveKit availability and pricing.
- Media quality/ops are largely outside CircleSfera’s Nest process.
- Credential and URL configuration (`LIVEKIT_*` / `VITE_LIVEKIT_URL`) are required for live features in production.
