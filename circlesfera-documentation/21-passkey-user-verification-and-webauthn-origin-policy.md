# CircleSfera: Passkey User-Verification Assurance Policy & WebAuthn Origin Hardening

> **Status:** Production / Implemented  
> **Order / Task:** Order 77 (SEC-006) & Order 78 (SEC-007) — Gate A (Security)  
> **Dependencies:** `SEC-005`, `CONFIG-001`, `SEC-014`  
> **Source of Truth:** Codebase implementation (`passkey.config.ts`, `passkey.service.ts`, `passkey.controller.ts`, `passkey.dto.ts`) and automated test suites (`passkey.config.spec.ts`, `passkey.service.spec.ts`, `passkey.controller.spec.ts`).

---

## 1. Threat Model and Security Objectives

FIDO2 / WebAuthn passwordless authentication provides phishing-resistant authentication by binding public key credentials to a specific Relying Party ID (RP ID) and cryptographic origin. However, production deployments require strict defense-in-depth policies to prevent origin drift and ensure appropriate assurance levels:

### 1.1 Development Fallbacks in Production (SEC-007)
- **Vulnerability:** If relying party identifiers (`WEBAUTHN_RP_ID`) or origins (`WEBAUTHN_ORIGIN`) silently fall back to `localhost` or `http://localhost:5173` when environment variables are missing or misconfigured in production, authenticators may bind credentials to incorrect domains or fail closed unexpectedly during user sessions. In the worst case, permissive origin verification could permit localhost-relayed credential assertions.
- **Remediation:** Production Fail-Closed Invariant. When `NODE_ENV === 'production'`, `PasskeyService` initialization immediately throws a fatal exception if `WEBAUTHN_RP_ID` is missing, empty, or set to `'localhost'`, or if `WEBAUTHN_ORIGIN` is missing or contains non-HTTPS (`http://`, `localhost`, `127.0.0.1`) schemes.

### 1.2 User Verification (UV) Assurance Mismatch (SEC-006)
- **Vulnerability:** WebAuthn allows authenticators to verify the user via local biometrics or PIN (`flags.uv === true`), or merely confirm physical user presence via a button press (`flags.up === true`). If a system universally marks `userVerification: 'preferred'` without distinguishing between everyday login and sensitive operations, attackers with physical possession of a basic roaming hardware token could execute destructive actions (such as registering replacement passkeys or deleting existing credentials) without biometric or PIN verification. Conversely, universally requiring UV for all logins would lock out users with basic FIDO security keys lacking biometric sensors.
- **Remediation:** Tiered User Verification Assurance Policy. Routine passwordless logins prefer UV (`'preferred'`) to maximize hardware compatibility, while sensitive operations (credential registration, passkey management, step-up re-authentication) strictly mandate UV (`'required'`) and fail closed if biometric or PIN verification was not performed.

---

## 2. WebAuthn Configuration & Production Fail-Closed Policy (SEC-007)

Configuration parsing is centralized in `src/auth/passkey/passkey.config.ts` via `parseWebAuthnConfig`:

### 2.1 Configuration Rules

| Environment | Parameter | Validation Rule | Default Fallback |
|---|---|---|---|
| **Production** | `WEBAUTHN_RP_ID` | Mandatory, non-empty, cannot equal `'localhost'` | *None (Throws Error)* |
| **Production** | `WEBAUTHN_ORIGIN` | Mandatory, comma-separated list of HTTPS URLs | *None (Throws Error)* |
| **Non-Production** | `WEBAUTHN_RP_ID` | Optional | `'localhost'` |
| **Non-Production** | `WEBAUTHN_ORIGIN` | Optional | `['http://localhost:5173']` |

```typescript
// src/auth/passkey/passkey.config.ts
export function parseWebAuthnConfig(configService: Pick<ConfigService, 'get'>): WebAuthnConfig {
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const rawRpId = configService.get<string>('WEBAUTHN_RP_ID')?.trim();
  const rawOrigin = configService.get<string>('WEBAUTHN_ORIGIN')?.trim();

  if (isProd) {
    if (!rawRpId || rawRpId === '' || rawRpId.toLowerCase() === 'localhost') {
      throw new Error('WEBAUTHN_RP_ID environment variable is required in production and cannot be localhost');
    }
    if (!rawOrigin || rawOrigin === '') {
      throw new Error('WEBAUTHN_ORIGIN environment variable is required in production');
    }
    const origins = rawOrigin.split(',').map((o) => o.trim()).filter(Boolean);
    for (const origin of origins) {
      if (origin.startsWith('http://') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        throw new Error(`Insecure WebAuthn origin '${origin}' is forbidden in production; HTTPS required`);
      }
    }
    return { rpID: rawRpId, rpName: 'CircleSfera', origin: origins };
  }
  // Safe development fallback
  return { rpID: rawRpId || 'localhost', rpName: 'CircleSfera', origin: ['http://localhost:5173'] };
}
```

---

## 3. Tiered User-Verification Assurance Policy (SEC-006)

CircleSfera partitions WebAuthn operations into two explicit sensitivity tiers:

```typescript
// src/auth/passkey/passkey.config.ts
export type PasskeySensitivity = 'standard' | 'sensitive';

export const PASSKEY_ASSURANCE_POLICIES: Record<PasskeySensitivity, WebAuthnAssurancePolicy> = {
  standard: {
    userVerification: 'preferred',
    requireUserVerification: false,
  },
  sensitive: {
    userVerification: 'required',
    requireUserVerification: true,
  },
};
```

### 3.1 Standard Authentication (Passwordless Login)
- **Target:** Day-to-day login (`POST /api/v1/auth/passkey/login-options`).
- **Options Generation:** Requests `userVerification: 'preferred'`.
- **Response Verification:** Runs with `requireUserVerification: false`.
- **Assurance Tracking:** Evaluates `verification.authenticationInfo.userVerified`. If the authenticator performed biometrics/PIN, `userVerified` is `true`; if only physical touch was provided, `userVerified` is `false`, permitting successful session creation while recording the exact assurance level.

### 3.2 Sensitive Operations (Enrollment, Management, Step-Up)
- **Target:** Passkey credential registration (`POST /api/v1/auth/passkey/register-options`), passkey deletion, high-privilege account adjustments.
- **Options Generation:** Requests `userVerification: 'required'`.
- **Response Verification:** Runs with `requireUserVerification: true`.
- **Enforcement:** If `flags.uv === false`, the verification strictly aborts with `BadRequestException('User verification is required for sensitive operations')`. No credential is created or modified without verified biometric or PIN confirmation.

---

## 4. Scoped Challenge Architecture and Replay Prevention

Challenge issuance in `PasskeyService` explicitly marks the required assurance tier in the durable `PasskeyChallenge` record:

1. **Scope Derivation:**
   - Standard Login: `scope: 'AUTHENTICATION'`
   - Sensitive Re-Auth: `scope: 'AUTHENTICATION:SENSITIVE'`
   - Passkey Enrollment: `scope: 'REGISTRATION:SENSITIVE'`
2. **Atomic Single-Use Consumption (`consumeChallenge`):**
   - Validates that the challenge exists, belongs to the expected user, and matches the expected scope prefix.
   - Extracts `isSensitive = record.scope.includes(':SENSITIVE')`.
   - Atomically deletes the challenge record within a transaction to prevent replay attacks.
   - Applies `requireUserVerification = isSensitive` during assertion evaluation.

---

## 5. Verification Matrix

| Test Suite | File | Coverage |
|---|---|---|
| **Passkey Config & Validation** | `passkey.config.spec.ts` | 11 unit tests covering policy mapping, non-prod fallbacks, production fail-closed on missing RP ID, localhost rejection, missing origins, HTTP protocol rejection, and IP address rejection. |
| **Passkey Service Security** | `passkey.service.spec.ts` | 41 unit tests covering standard vs sensitive registration options, standard vs sensitive authentication options, UV rejection on sensitive operations, UP acceptance on login, challenge single-use atomicity, and production initialization errors. |
| **Passkey Controller** | `passkey.controller.spec.ts` | 8 integration tests covering endpoint routing, sensitivity parameter forwarding, session boundaries, and cookie issuance. |
