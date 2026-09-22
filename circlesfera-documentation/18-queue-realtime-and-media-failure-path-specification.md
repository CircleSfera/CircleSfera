# CircleSfera: Queue, Realtime & Media Failure-Path Specification

> **Status:** Production / Implemented  
> **Order / Task:** Order 71 (QA-007) — Gate D (QA)  
> **Dependencies:** `QUEUE-001`, `REDIS-002`, `RT-003`, `UPLOAD-006`  
> **Source of Truth:** Codebase implementation (`UploadsService`, `VideoProcessor`, `MediaCleanupProcessor`, `SocketAuthService`, `AppGateway`, `FeedService`) and automated suites (`media.security.e2e-spec.ts`, `realtime.security.e2e-spec.ts`, `failure-recovery-invariants.spec.ts`).

---

## 1. Overview and Engineering Objectives

Asynchronous background queues, real-time WebSocket communication, and heavy media processing pipelines are inherently vulnerable to transient infrastructure faults, saturation, network partitions, and malicious input. A robust social architecture must guarantee that:

1. **Infrastructure Degradation is Isolated:** Failures in external caches (Redis), storage backends (S3), or third-party APIs never crash consumer-facing HTTP endpoints or corrupt permanent data.
2. **Admission Control Prevents Cascading Failure:** Heavy background compute tasks (video transcoding) reject incoming requests before saturating worker queues or exhausting system memory.
3. **Realtime Boundaries Fail Closed:** Unauthenticated, forged, deactivated, or cross-tenant WebSocket connections and events are dropped immediately without leaking state or broadcasting unauthorized messages.
4. **Queue Retries Distinguish Transient from Terminal Errors:** Transient network and database timeouts trigger exponential backoff, while malformed payloads throw `UnrecoverableError` to avoid poison-pill retry storms.

---

## 2. Media Pipeline Failure Paths & Admission Control (`UPLOAD-006`)

### 2.1 Video Admission Control
To prevent video transcoding queues from growing unbounded during traffic spikes or targeted resource exhaustion attacks, `UploadsService.assertVideoAdmission` enforces two deterministic gates before processing or storing bytes:

```
Incoming Video Upload
         │
         ▼
[Global Queue Backlog Check] ──── (waiting + active >= maxBacklog) ───► 503 Service Unavailable
         │ (< maxBacklog)
         ▼
[Per-User Concurrency Quota] ──── (user active/waiting >= quota)  ───► 429 Too Many Requests
         │ (< quota)
         ▼
[Signature Validation & Storage]
```

- **Global Saturation Gate:** When the combined sum of waiting and active jobs on the `video-transcoding` BullMQ queue reaches `VIDEO_TRANSCODING_MAX_BACKLOG` (default: 20), incoming video uploads immediately fail with `503 ServiceUnavailableException` (`'Video processing capacity is currently saturated. Please try again later.'`).
- **Per-User Quota Gate:** When an authenticated user already has `VIDEO_TRANSCODING_USER_QUOTA` (default: 2) concurrent active or waiting transcoding jobs, subsequent video uploads fail with `429 Too Many Requests` (`'You have reached the maximum number of concurrent video processing jobs. Please wait for previous videos to finish processing.'`).

### 2.2 Storage Provider Failure & Early Validation
- **MIME & Magic Bytes Enforcement:** Requests with missing files, unsupported extensions (`.svg`, `.sh`, `.exe`), or content-type spoofing fail early at `ParseFilePipe` with `400 Bad Request`.
- **Signature Validation Pre-Check:** `MediaSignatureValidator.validate` checks buffer magic numbers before handing off to the storage provider.
- **Clean Error Bubbling:** If `storageProvider.upload` fails (e.g. S3 network timeout or disk full), `UploadsService` logs the error, suppresses job enqueuing to `videoQueue`, and re-throws the error to express a clean 500 without leaving orphaned database or queue entries.

### 2.3 VideoProcessor Terminal & Retry Semantics
- **Terminal Payload Rejection:** If `job.name` is unknown or `job.data.url` is missing, `VideoProcessor` throws `UnrecoverableError`, immediately stopping retries.
- **Path Manipulation Guard:** Basenames must match a strict UUID v4 pattern (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`). Non-UUID basenames immediately throw `UnrecoverableError`.
- **Directory Cleanup on Transcode Failure:** If FFmpeg transcoding fails during HLS conversion, `VideoProcessor` cleans up the temporary output directory via `fs.rmSync(createdOutputDir, { recursive: true, force: true })` and re-throws the error to allow BullMQ exponential backoff.

### 2.4 MediaCleanupProcessor Retries and Incident Emission
- **Batch Deletion Retries:** When cleaning up deleted or orphaned media files, transient storage errors re-throw the error to trigger BullMQ exponential backoff (up to 5 attempts).
- **Incident Escalation:** Upon exhausting all 5 attempts (`currentAttempt >= maxAttempts`), `MediaCleanupProcessor` emits a `system.incident` event (`statusCode: 500, path: 'media-cleanup/delete-media-batch'`) for operational alerting before marking the job failed.

---

## 3. Realtime & WebSocket Failure Invariants (`RT-003`)

### 3.1 Authentication Handshake & Account Verification
The `AppGateway` handles WebSocket connections over `/socket.io/` under the `events` namespace. `SocketAuthService.authenticate` enforces:

1. **Token Extraction:** Inspects `client.handshake.headers.cookie` for `access_token`, falling back to `Authorization: Bearer <token>`. If neither is found, throws `UnauthorizedException('No token found')` and terminates the socket connection.
2. **Cryptographic JWT Verification:** Verifies token signature using `JWT_SECRET`. Malformed, expired, or tampered tokens throw an exception, immediately disconnecting the client.
3. **Deactivated Account Gate:** If `!user?.isActive`, throws `UnauthorizedException('User not found or account deactivated')` and disconnects the socket.
4. **Suspended Profile Gate:** If `user.profiles[0]?.suspendedUntil > new Date()`, throws `UnauthorizedException('Account suspended')` and disconnects.
5. **Profile Missing Gate:** If `!profileId`, throws `UnauthorizedException('Profile not found')` and disconnects.

### 3.2 Cross-Conversation Event Isolation
- **Room Authorization:** Upon successful handshake, `SocketWithAuth.data.conversationIds` stores the set of conversation IDs the user belongs to.
- **Typing Events (`typing_start` / `typing_stop`):** If `!client.data?.conversationIds?.has(payload.conversationId)`, the event is silently dropped, preventing cross-tenant presence leakage.
- **Message Reactions (`send_reaction`):** If caller lacks in-memory access and database lookup confirms non-membership, the reaction is rejected and no event is broadcast.
- **Read Receipts (`mark_read`):** Emitted only when the caller is an authorized member of the target conversation.

### 3.3 WebRTC VOIP Signaling Failures
- **Busy Target Handling:** If a caller invites a peer who is already on an active call, `webrtcSignalingService.authorizeAndInitiateCall` returns `{ ok: false, reason: 'BUSY' }`, and the gateway emits `call:declined` with `{ reason: 'busy' }` to the caller.
- **Payload Bounds Enforcement:** Signals exceeding 32 KB are dropped to prevent buffer overflow attacks.
- **Unauthorized Signaling:** Signals sent for non-existent or un-owned call sessions are dropped.

---

## 4. Queue and Redis Degradation Invariants (`REDIS-002`)

### 4.1 Redis Cache Outage Tolerance
In social feeds, reading cached timelines from Redis sorted sets is the primary fast path (`FeedInboxService.getInbox`). During a Redis cluster outage, network partition, or eviction storm:

- **Observable Degradation:** `getInbox` returns `null` instead of an empty array `[]` when Redis is unavailable or throws.
- **Graceful Fallback:** `FeedService.getFollowingFeed` catches the `null` response and cleanly falls back to canonical PostgreSQL queries without returning a 500 error to the client.
- **Suppression of Destructive Rebuilds:** If `inboxPostIds === null`, background inbox rebuild is **suppressed**. CircleSfera never attempts to write or rebuild cache data into a failing Redis cluster, avoiding cascading saturation.
- **Resilient Counter Fallback:** When `getInboxCount` returns `null`, the feed metadata `total` defaults to the length of returned SQL posts rather than throwing or showing zero items.

### 4.2 BullMQ Processor Workload Policies (`QUEUE-001`, `QUEUE-002`)
All BullMQ queues and workers adhere to `src/common/constants/queue-policy.constants.ts`:

| Workload Class | Target Queues | Concurrency | Attempts | Backoff Type | Delay |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CRITICAL_DATA` | `users-processing`, `media-cleanup` | 1–2 | 5 | Exponential | 2000–5000ms |
| `EVENT_DISTRIBUTION` | `feed-fanout`, `notifications-processing` | 5–10 | 3 | Exponential | 1000–2000ms |
| `HEAVY_COMPUTE` | `video-transcoding` | 2 | 3 | Exponential | 5000ms |
| `BACKGROUND_SYNC` | `analytics-processing`, `warehouse-export` | 1–2 | 3 | Exponential | 3000ms |

---

## 5. Verification Matrix

| Area | Invariant Verified | Suite | Test Type |
| :--- | :--- | :--- | :--- |
| **Media HTTP** | Unauthenticated upload rejected (401) | `media.security.e2e-spec.ts` | E2E |
| **Media HTTP** | Missing file rejected (400) | `media.security.e2e-spec.ts` | E2E |
| **Media HTTP** | Unverified user rejected (403) | `media.security.e2e-spec.ts` | E2E |
| **Media HTTP** | Malicious script / SVG rejected (400) | `media.security.e2e-spec.ts` | E2E |
| **Media Admission** | Global queue saturated (503) | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Media Admission** | Per-user quota saturated (429) | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Media Storage** | S3 timeout / write failure cleanly bubbles | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Video Worker** | Malformed / non-UUID basename rejected | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Cleanup Worker** | Batch deletion retry on failure | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Cleanup Worker** | `system.incident` on max attempt exhaustion | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Realtime HTTP** | Missing token disconnected | `realtime.security.e2e-spec.ts` | E2E |
| **Realtime HTTP** | Forged JWT disconnected | `realtime.security.e2e-spec.ts` | E2E |
| **Realtime HTTP** | Deactivated user disconnected | `realtime.security.e2e-spec.ts` | E2E |
| **Realtime HTTP** | Suspended profile disconnected | `realtime.security.e2e-spec.ts` | E2E |
| **Realtime Gateway** | Cross-conversation typing dropped | `realtime.security.e2e-spec.ts` | E2E |
| **Realtime Gateway** | Cross-conversation reaction dropped | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Feed Degradation** | Redis null falls back to SQL (`REDIS-002`) | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Feed Degradation** | Rebuild suppressed when Redis is down | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
| **Feed Degradation** | Total defaults gracefully when count fails | `failure-recovery-invariants.spec.ts` | Unit / Invariant |
