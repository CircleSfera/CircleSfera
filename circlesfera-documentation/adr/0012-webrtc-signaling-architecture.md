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

## Module boundary (RT-006)

`circlesfera-backend/src/webrtc/` (`WebrtcModule`) and the signaling transport described above live in two
different modules, and their names are not a reliable guide to that split — this section exists precisely
because "webrtc" and "signaling" both appear in a module name that does not own signaling:

- **`WebrtcModule` provides ICE capability, not signaling transport.** `WebrtcController`/`WebrtcService`
  expose `GET /webrtc/ice-servers` (Metered.ca TURN credentials, falling back to public STUN) — configuration
  data the frontend needs to establish the peer connection, fetched once per call setup, unrelated to the
  ongoing signaling exchange.
- **`WebrtcSignalingService`, despite its name, does not relay signaling messages.** It holds the in-memory
  call state machine and authorization checks (`authorizeAndInitiateCall`, `authorizeAndAcceptCall`,
  `authorizeAndDeclineCall`, `authorizeSignal`, `authorizeAndEndCall` — blocklist checks, active-conversation
  requirement, peer/state validation) that `AppGateway`'s `call:*` handlers call into before emitting or
  relaying anything. It never touches `Server`/`Socket` directly and has no room-broadcast responsibility.
- **`AppGateway` (`circlesfera-backend/src/socket/app.gateway.ts`, `SocketModule`) is the sole owner of the
  signaling transport** — every `call:*` event, `SDP`/ICE relay, and room-targeted emit described above.
  `WebrtcModule` is one of its dependencies, not a peer signaling implementation.

Net: one call setup touches three responsibilities across two modules — ICE config (REST,
`WebrtcModule`), call authorization/state (`WebrtcSignalingService`, injected into `AppGateway`), and the
actual signaling relay (`AppGateway` itself). A future change to *how* SDP/ICE candidates are relayed
belongs in `AppGateway`; a change to *whether* a call is allowed belongs in `WebrtcSignalingService`; a
change to *which* TURN provider is used belongs in `WebrtcService`.
