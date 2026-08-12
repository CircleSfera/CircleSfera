# ADR-0012: WebRTC Voice & Video Call Signaling Architecture and Socket Event Compatibility

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** CircleSfera engineering

## Context

CircleSfera supports 1-on-1 audio and video calling directly between users over WebRTC peer-to-peer connections. The signaling exchange (SDP offers, answers, and ICE candidates) must route through a reliable WebSocket server with low latency, proper room scoping, and backward-compatible payloads.

## Decision

Use the existing NestJS `@WebSocketGateway` (`AppGateway`) in `circlesfera-backend` to handle WebRTC call signaling events under the `'events'` namespace:

1. **Call Initiation**: Support both `call:invite` and `call:initiate` event subscriptions on the gateway, mapping `targetId` and `recipientId` to allow frontend version flexibility.
2. **Call State Transitions**:
   - `call:incoming`: Emitted to recipient with caller profile and media type (`audio` / `video`).
   - `call:accepted`: Emitted to caller when recipient accepts the call.
   - `call:declined`: Emitted to caller when recipient declines or is busy.
   - `call:ended`: Emitted to target user when either party hangs up.
   - `call:signal`: Bi-directional transparent relay of SDP and ICE candidates.
3. **Room Scoping**: Broadcast signaling messages to user-specific rooms (`user:${userId}`).

## Consequences

- Clean separation between WebRTC peer media transport (P2P / TURN server) and WebSocket signaling (`AppGateway`).
- Frontend components (`webrtc.service.ts`, `useCallListeners.ts`) and backend gateway stay aligned with 100% test coverage.
- TURN/STUN server relay (e.g. Coturn) remains required for NAT traversal in production environments.
