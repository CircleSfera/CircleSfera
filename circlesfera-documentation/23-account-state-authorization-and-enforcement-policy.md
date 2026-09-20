# 23. Account-State Authorization and Cross-Surface Enforcement Policy

## 1. Overview and Purpose

CircleSfera enforces strict, zero-bypass account-state authorization across all application surfaces:
REST API endpoints, WebSocket realtime connections (Socket.IO), background workers (BullMQ), and authentication token rotation.

Prior to this policy, account standing checks (such as administrative bans and suspensions) were evaluated piecemeal in individual controllers and strategies, allowing inconsistencies:
- Realtime Socket.IO handshakes checked only `user.isActive` and temporary suspension, leaving root and profile administrative bans un-enforced during socket establishment.
- Active WebSocket connections were never evicted when an administrator banned or suspended an account, allowing banned users to stream and chat until socket disconnect.
- Refresh token rotation allowed held refresh tokens to rotate into new access tokens even if the underlying user had been banned or deactivated after issuance.
- Background asynchronous workers continued distributing feed fan-outs, sending push digests, and transcoding video for banned or deactivated accounts.

This policy defines the canonical account states, the shared `AccountStateService` enforcement engine, realtime session termination semantics, and background worker invariants.

---

## 2. Canonical Account Standing Matrix

Account standing is determined across two interrelated database entities: `User` (the authentication root identity) and `Profile` (the public actor identity).

| State | User Model Criteria | Profile Model Criteria | Operational? | REST Response | Realtime Action | Worker Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ACTIVE** | `isActive = true`<br>`isRootBanned = false` | `isAccountBanned = false`<br>`suspendedUntil <= now` or `null` | **Yes** | 200 OK | Allowed | Processed normally |
| **BANNED (Root)** | `isRootBanned = true` | Any | **No** | 401 Unauthorized (`ApiErrorCode.ACCOUNT_BANNED`, reason) | Handshake rejected; active sockets evicted | Aborted / Filtered |
| **BANNED (Profile)** | Any | `isAccountBanned = true` | **No** | 401 Unauthorized (`ApiErrorCode.ACCOUNT_BANNED`, reason) | Handshake rejected; active sockets evicted | Aborted / Filtered |
| **SUSPENDED** | `isActive = true`<br>`isRootBanned = false` | `suspendedUntil > now` | **No** | 401 Unauthorized (`ApiErrorCode.ACCOUNT_SUSPENDED`, `suspendedUntil`) | Handshake rejected; active sockets evicted | Aborted / Filtered |
| **SCHEDULED DELETION** | `isActive = false`<br>`scheduledDeletionAt > now` | Any | **No** (except login restore) | 401 Unauthorized (`User not found or account deactivated`) | Handshake rejected; active sockets evicted | Aborted / Filtered |
| **DEACTIVATED** | `isActive = false` | Any | **No** | 401 Unauthorized (`User not found or account deactivated`) | Handshake rejected; active sockets evicted | Aborted / Filtered |

---

## 3. Shared Authorization Capability: `AccountStateService`

Located at `src/auth/services/account-state.service.ts` and registered globally via `AccountStateModule`, `AccountStateService` provides pure, standardized evaluation and enforcement:

```typescript
export class AccountStateService {
  // Pure evaluation returning structured status, operational boolean, and reasons
  evaluate(user: UserAccountStateInput, profile?: ProfileAccountStateInput): AccountStateEvaluation;

  // Boolean helper
  isOperational(user: UserAccountStateInput, profile?: ProfileAccountStateInput): boolean;

  // Enforces operational standing, throwing structured UnauthorizedException on violation
  assertOperational(user: UserAccountStateInput, profile?: ProfileAccountStateInput): void;
}
```

### Exception Guarantees
- Banned users receive HTTP 401 with `{ message: ApiErrorCode.ACCOUNT_BANNED, reason: ... }`.
- Suspended users receive HTTP 401 with `{ message: ApiErrorCode.ACCOUNT_SUSPENDED, suspendedUntil: ... }`.
- Inactive or missing users receive HTTP 401 with `'User not found or account deactivated'`.

---

## 4. Enforcement Surfaces

### 4.1. REST Strategy (`JwtStrategy`)
- Every authenticated REST request passes through `JwtStrategy.validate(payload)`.
- Queries both `User` and `Profile` (including `isAccountBanned`, `accountBanReason`, `suspendedUntil`).
- Calls `accountStateService.assertOperational(user, profile)`.
- Immediately blocks requests from non-operational accounts before any controller handler executes.

### 4.2. Token Refresh Rotation (`AuthService.refreshToken`)
- Token rotation verifies that the target `User` and `Profile` remain operational.
- If the account has been banned, suspended, or deactivated since the refresh token was issued:
  1. The compromised token is immediately deleted from the database.
  2. `assertOperational` throws the corresponding 401 exception.
  3. No new access or refresh tokens are issued.

### 4.3. Realtime WebSockets (`SocketAuthService` & `AppGateway`)
- **Handshake Gate**: During connection handshake (`/events` namespace), `SocketAuthService.authenticate` invokes `accountStateService.assertOperational(user, profile)`. Banned or suspended clients cannot connect.
- **Active Eviction via Event-Driven Architecture (EDA)**:
  When an admin bans or suspends a user, or when a user schedules deletion:
  1. All database refresh tokens for `userId` are deleted (`prisma.refreshToken.deleteMany`).
  2. An internal domain event `user.session.terminate` is dispatched via `EventEmitter2`.
  3. `AppGateway.handleUserSessionTerminate` captures the event, emits `session_terminated` to the user's room and active socket connections, and actively invokes `socket.disconnect(true)`.

### 4.4. Background Workers (BullMQ)
- **`NotificationsProcessor`**: `sendDigestPushNotifications` includes relation filters in Prisma queries so that recipients with `user.isActive = false`, `user.isRootBanned = true`, `profile.isAccountBanned = true`, or active suspensions are omitted from push notifications.
- **`FeedFanoutProcessor`**: Verifies author standing before running follower fan-out queries. If author is banned, deactivated, or suspended, fan-out is aborted immediately. Followers who are banned or deactivated are excluded from inbox delivery.
- **`VideoProcessor`**: If a video transcoding job specifies `userId`, user standing is validated prior to FFmpeg execution. If the user is un-operational, the transcoding job aborts immediately.

---

## 5. Administrative Consistency & Lifecycle Actions

- **`AdminUsersService.banUser` & `UsersService.banUser`**: Both atomically set `isActive: false` and `isRootBanned: true`, delete all active refresh tokens, and dispatch `user.session.terminate`.
- **`AdminUsersService.unbanUser` & `UsersService.unbanUser`**: Both restore `isActive: true`, `isRootBanned: false`, `isAccountBanned: false`, and clear `suspendedUntil: null`.
- **`AdminUsersService.suspendUser`**: Sets `suspendedUntil: until`, `isActive: false`, deletes all refresh tokens, and dispatches `user.session.terminate`.
- **`UsersService.scheduleDeletion`**: Sets `isActive: false`, schedules outbox hard-delete, deletes all refresh tokens, and dispatches `user.session.terminate`.
